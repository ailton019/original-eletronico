// js/relatorios.js
// Sistema de Relatórios - VERSÃO CORRIGIDA

let chartVendasMes = null;
let chartTopProdutos = null;
let chartFaturamento = null;

// Flag para controle de carregamento
let dadosCarregados = {
    movimento: false,
    faturamento: false,
    vendas: false
};

// Variáveis para armazenar dados brutos para exportação
let dadosExportacao = {
    movimento: null,
    faturamento: null,
    vendas: null
};

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!temPermissao('relatorios', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador',
        gerente: '📊 Gerente',
        vendedor: '💰 Vendedor',
        tecnico: '🔧 Técnico',
        basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    // Data padrão
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('movimentoData').value = hoje;
    
    // Inicializar
    carregarDashboard();
    carregarMovimentoDiario();
    carregarFaturamento();
    carregarVendasProduto();
});

// =====================================================
// FUNÇÕES DE ABAS
// =====================================================

function abrirAba(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
}

// =====================================================
// DASHBOARD
// =====================================================

async function carregarDashboard() {
    try {
        const podeExportar = temPermissao('relatorios', 'exportar');
        
        const [vendasRes, entradasRes, saidasRes, clientesRes, produtosRes] = await Promise.all([
            supabaseClient.from('saidas').select('total'),
            supabaseClient.from('entradas').select('total'),
            supabaseClient.from('saidas').select('total, data'),
            supabaseClient.from('clientes').select('id', { count: 'exact' }).eq('ativo', true),
            supabaseClient.from('produtos').select('id', { count: 'exact' }).eq('ativo', true)
        ]);
        
        const totalVendas = vendasRes.data?.reduce((sum, v) => sum + (v.total || 0), 0) || 0;
        const totalEntradas = entradasRes.data?.reduce((sum, e) => sum + (e.total || 0), 0) || 0;
        const totalSaidas = saidasRes.data?.length || 0;
        const totalClientes = clientesRes.count || 0;
        const totalProdutos = produtosRes.count || 0;
        
        const ticketMedio = totalSaidas > 0 ? totalVendas / totalSaidas : 0;
        
        document.getElementById('kpiTotalVendas').textContent = `R$ ${totalVendas.toFixed(2)}`;
        document.getElementById('kpiTotalEntradas').textContent = totalEntradas.toFixed(2);
        document.getElementById('kpiTotalSaidas').textContent = totalSaidas;
        document.getElementById('kpiTotalClientes').textContent = totalClientes;
        document.getElementById('kpiTotalProdutos').textContent = totalProdutos;
        document.getElementById('kpiTicketMedio').textContent = `R$ ${ticketMedio.toFixed(2)}`;
        
        // Gráfico de vendas por mês
        const { data: vendasMes } = await supabaseClient
            .from('saidas')
            .select('data, total')
            .order('data', { ascending: true });
        
        if (vendasMes) {
            const vendasPorMes = {};
            vendasMes.forEach(v => {
                const mes = new Date(v.data).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                vendasPorMes[mes] = (vendasPorMes[mes] || 0) + (v.total || 0);
            });
            
            const labels = Object.keys(vendasPorMes);
            const valores = Object.values(vendasPorMes);
            
            const ctx = document.getElementById('chartVendasMes');
            if (ctx) {
                if (chartVendasMes) chartVendasMes.destroy();
                chartVendasMes = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Vendas (R$)',
                            data: valores,
                            backgroundColor: 'rgba(235, 94, 40, 0.1)',
                            borderColor: '#eb5e28',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { callback: v => 'R$ ' + v.toFixed(2) }
                            }
                        }
                    }
                });
            }
        }
        
        // Gráfico Top 5 Produtos
        const { data: topProdutos } = await supabaseClient
            .from('saida_itens')
            .select(`
                quantidade,
                produtos (nome)
            `)
            .limit(100);
        
        if (topProdutos) {
            const produtosMap = {};
            topProdutos.forEach(item => {
                const nome = item.produtos?.nome || 'Produto';
                produtosMap[nome] = (produtosMap[nome] || 0) + (item.quantidade || 0);
            });
            
            const top5 = Object.entries(produtosMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            const ctxTop = document.getElementById('chartTopProdutos');
            if (ctxTop && top5.length > 0) {
                if (chartTopProdutos) chartTopProdutos.destroy();
                chartTopProdutos = new Chart(ctxTop, {
                    type: 'bar',
                    data: {
                        labels: top5.map(item => item[0]),
                        datasets: [{
                            label: 'Quantidade Vendida',
                            data: top5.map(item => item[1]),
                            backgroundColor: ['#eb5e28', '#403d39', '#ccc5b9', '#252422', '#fffcf2'],
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1 } }
                        }
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        mostrarNotificacao('Erro ao carregar dashboard', 'error');
    }
}

// =====================================================
// MOVIMENTO DIÁRIO
// =====================================================

async function carregarMovimentoDiario() {
    const data = document.getElementById('movimentoData').value;
    if (!data) {
        mostrarNotificacao('Selecione uma data!', 'warning');
        return;
    }
    
    try {
        const container = document.getElementById('movimentoContainer');
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando...</div>';
        dadosCarregados.movimento = false;
        
        const [entradasRes, saidasRes] = await Promise.all([
            supabaseClient.from('entradas').select(`
                *,
                clientes:fornecedor_id(nome)
            `).eq('data', data),
            supabaseClient.from('saidas').select(`
                *,
                clientes(nome)
            `).eq('data', data)
        ]);
        
        const entradas = entradasRes.data || [];
        const saidas = saidasRes.data || [];
        
        // Armazenar para exportação
        dadosExportacao.movimento = { entradas, saidas, data };
        
        const totalEntradas = entradas.reduce((sum, e) => sum + (e.total || 0), 0);
        const totalSaidas = saidas.reduce((sum, s) => sum + (s.total || 0), 0);
        const saldo = totalEntradas - totalSaidas;
        
        let html = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>📥 Total Entradas</strong>
                    <div style="font-size: 20px; color: #155724;">R$ ${totalEntradas.toFixed(2)}</div>
                </div>
                <div style="background: #f8d7da; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>📤 Total Saídas</strong>
                    <div style="font-size: 20px; color: #721c24;">R$ ${totalSaidas.toFixed(2)}</div>
                </div>
                <div style="background: ${saldo >= 0 ? '#cce5ff' : '#f8d7da'}; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>💰 Saldo do Dia</strong>
                    <div style="font-size: 20px; color: ${saldo >= 0 ? '#004085' : '#721c24'};">R$ ${saldo.toFixed(2)}</div>
                </div>
            </div>
            
            <h4>📥 Entradas do Dia</h4>
            <table class="table-relatorio">
                <thead>
                    <tr><th>Nº</th><th>Fornecedor</th><th>Total</th><th>Observação</th></tr>
                </thead>
                <tbody>
                    ${entradas.length > 0 ? entradas.map(e => `
                        <tr>
                            <td>#${e.id}</td>
                            <td>${e.clientes?.nome || '-'}</td>
                            <td>R$ ${(e.total || 0).toFixed(2)}</td>
                            <td>${e.observacao || '-'}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="4">Nenhuma entrada no dia</td></tr>'}
                    <tr class="total-row">
                        <td colspan="2"><strong>Total</strong></td>
                        <td><strong>R$ ${totalEntradas.toFixed(2)}</strong></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
            
            <h4 style="margin-top: 20px;">📤 Saídas do Dia</h4>
            <table class="table-relatorio">
                <thead>
                    <tr><th>Nº</th><th>Cliente</th><th>Total</th><th>Forma Pagamento</th></tr>
                </thead>
                <tbody>
                    ${saidas.length > 0 ? saidas.map(s => `
                        <tr>
                            <td>#${s.id}</td>
                            <td>${s.clientes?.nome || '-'}</td>
                            <td>R$ ${(s.total || 0).toFixed(2)}</td>
                            <td>${s.forma_pagamento || '-'}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="4">Nenhuma saída no dia</td></tr>'}
                    <tr class="total-row">
                        <td colspan="2"><strong>Total</strong></td>
                        <td><strong>R$ ${totalSaidas.toFixed(2)}</strong></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        dadosCarregados.movimento = true;
        
        // Ocultar botões de exportação se não tiver permissão
        if (!temPermissao('relatorios', 'exportar')) {
            document.querySelectorAll('.btn-excel, .btn-pdf').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar movimento diário:', error);
        document.getElementById('movimentoContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Erro ao carregar dados</div>';
        dadosCarregados.movimento = false;
    }
}

// =====================================================
// FATURAMENTO
// =====================================================

async function carregarFaturamento() {
    try {
        const plano = document.getElementById('faturamentoPlano').value;
        const container = document.getElementById('faturamentoContainer');
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando...</div>';
        dadosCarregados.faturamento = false;
        
        const { data: vendas } = await supabaseClient
            .from('saidas')
            .select('data, total')
            .order('data', { ascending: true });
        
        if (!vendas || vendas.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma venda encontrada</div>';
            dadosCarregados.faturamento = false;
            return;
        }
        
        const grupos = {};
        vendas.forEach(v => {
            const data = new Date(v.data);
            let chave = '';
            
            switch(plano) {
                case 'diario':
                    chave = data.toISOString().split('T')[0];
                    break;
                case 'semanal':
                    const semana = data.getWeek();
                    chave = `Semana ${semana} - ${data.getFullYear()}`;
                    break;
                case 'mensal':
                    chave = data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    break;
                case 'anual':
                    chave = data.getFullYear().toString();
                    break;
                default:
                    chave = data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            }
            
            grupos[chave] = (grupos[chave] || 0) + (v.total || 0);
        });
        
        const labels = Object.keys(grupos);
        const valores = Object.values(grupos);
        const total = valores.reduce((sum, v) => sum + v, 0);
        
        // Armazenar para exportação
        dadosExportacao.faturamento = { labels, valores, total, plano };
        
        let html = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>💰 Total Faturamento</strong>
                    <div style="font-size: 22px; color: #155724;">R$ ${total.toFixed(2)}</div>
                </div>
                <div style="background: #cce5ff; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>📊 Período</strong>
                    <div style="font-size: 16px; color: #004085;">${labels.length} períodos</div>
                </div>
            </div>
            
            <table class="table-relatorio">
                <thead>
                    <tr><th>Período</th><th style="text-align: right;">Valor (R$)</th><th style="text-align: right;">% do Total</th></tr>
                </thead>
                <tbody>
                    ${labels.map((label, i) => `
                        <tr>
                            <td>${label}</td>
                            <td style="text-align: right;">R$ ${valores[i].toFixed(2)}</td>
                            <td style="text-align: right;">${total > 0 ? ((valores[i] / total) * 100).toFixed(1) : 0}%</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td><strong>TOTAL</strong></td>
                        <td style="text-align: right;"><strong>R$ ${total.toFixed(2)}</strong></td>
                        <td style="text-align: right;"><strong>100%</strong></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        dadosCarregados.faturamento = true;
        
        // Gráfico
        const ctx = document.getElementById('chartFaturamento');
        if (ctx) {
            if (chartFaturamento) chartFaturamento.destroy();
            chartFaturamento = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Faturamento (R$)',
                        data: valores,
                        backgroundColor: 'rgba(235, 94, 40, 0.6)',
                        borderColor: 'rgba(235, 94, 40, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: v => 'R$ ' + v.toFixed(2) }
                        }
                    }
                }
            });
        }
        
        // Ocultar botões de exportação se não tiver permissão
        if (!temPermissao('relatorios', 'exportar')) {
            document.querySelectorAll('.btn-excel, .btn-pdf').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar faturamento:', error);
        document.getElementById('faturamentoContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Erro ao carregar dados</div>';
        dadosCarregados.faturamento = false;
    }
}

// =====================================================
// VENDAS POR PRODUTO
// =====================================================

async function carregarVendasProduto() {
    try {
        const dataInicio = document.getElementById('vendasDataInicio').value;
        const dataFim = document.getElementById('vendasDataFim').value;
        const container = document.getElementById('vendasProdutoContainer');
        
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando...</div>';
        dadosCarregados.vendas = false;
        
        let query = supabaseClient
            .from('saida_itens')
            .select(`
                quantidade,
                subtotal,
                produtos (id, nome, codigo, categoria),
                saidas (data)
            `);
        
        if (dataInicio) query = query.gte('saidas.data', dataInicio);
        if (dataFim) query = query.lte('saidas.data', dataFim);
        
        const { data: itens } = await query;
        
        if (!itens || itens.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum produto vendido no período</div>';
            dadosCarregados.vendas = false;
            return;
        }
        
        const produtosMap = {};
        itens.forEach(item => {
            const nome = item.produtos?.nome || 'Produto';
            const codigo = item.produtos?.codigo || '-';
            if (!produtosMap[nome]) {
                produtosMap[nome] = {
                    codigo: codigo,
                    categoria: item.produtos?.categoria || '-',
                    quantidade: 0,
                    total: 0
                };
            }
            produtosMap[nome].quantidade += item.quantidade || 0;
            produtosMap[nome].total += item.subtotal || 0;
        });
        
        const sorted = Object.entries(produtosMap)
            .sort((a, b) => b[1].total - a[1].total);
        
        const totalGeral = sorted.reduce((sum, item) => sum + item[1].total, 0);
        
        // Armazenar para exportação
        dadosExportacao.vendas = { sorted, totalGeral, dataInicio, dataFim };
        
        let html = `
            <div style="margin-bottom: 15px; background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                <strong>💰 Total Geral de Vendas</strong>
                <div style="font-size: 22px; color: #155724;">R$ ${totalGeral.toFixed(2)}</div>
            </div>
            
            <table class="table-relatorio">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th style="text-align: center;">Qtd Vendida</th>
                        <th style="text-align: right;">Total (R$)</th>
                        <th style="text-align: right;">%</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([nome, dados]) => `
                        <tr>
                            <td>${dados.codigo}</td>
                            <td><strong>${nome}</strong></td>
                            <td>${dados.categoria}</td>
                            <td style="text-align: center;">${dados.quantidade}</td>
                            <td style="text-align: right;">R$ ${dados.total.toFixed(2)}</td>
                            <td style="text-align: right;">${totalGeral > 0 ? ((dados.total / totalGeral) * 100).toFixed(1) : 0}%</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td colspan="3"><strong>TOTAL</strong></td>
                        <td style="text-align: center;"><strong>${sorted.reduce((sum, item) => sum + item[1].quantidade, 0)}</strong></td>
                        <td style="text-align: right;"><strong>R$ ${totalGeral.toFixed(2)}</strong></td>
                        <td style="text-align: right;"><strong>100%</strong></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        dadosCarregados.vendas = true;
        
        if (!temPermissao('relatorios', 'exportar')) {
            document.querySelectorAll('.btn-excel, .btn-pdf').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar vendas por produto:', error);
        document.getElementById('vendasProdutoContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Erro ao carregar dados</div>';
        dadosCarregados.vendas = false;
    }
}

// =====================================================
// EXPORTAÇÕES - VERSÃO CORRIGIDA
// =====================================================

function exportarExcel(tipo) {
    if (!temPermissao('relatorios', 'exportar')) {
        mostrarNotificacao('Você não tem permissão para exportar dados!', 'error');
        return;
    }
    
    let dados = [];
    let nomeArquivo = '';
    let titulo = '';
    
    switch(tipo) {
        case 'movimento':
            if (!dadosCarregados.movimento || !dadosExportacao.movimento) {
                mostrarNotificacao('Carregue o relatório de movimento primeiro!', 'warning');
                return;
            }
            const mov = dadosExportacao.movimento;
            dados = [
                ['RELATÓRIO DE MOVIMENTO DIÁRIO'],
                [`Data: ${mov.data}`],
                [''],
                ['ENTRADAS DO DIA'],
                ['Nº', 'Fornecedor', 'Total', 'Observação']
            ];
            mov.entradas.forEach(e => {
                dados.push([`#${e.id}`, e.clientes?.nome || '-', `R$ ${(e.total || 0).toFixed(2)}`, e.observacao || '-']);
            });
            const totalEntradas = mov.entradas.reduce((sum, e) => sum + (e.total || 0), 0);
            dados.push(['Total', '', `R$ ${totalEntradas.toFixed(2)}`, '']);
            dados.push(['']);
            dados.push(['SAÍDAS DO DIA']);
            dados.push(['Nº', 'Cliente', 'Total', 'Forma Pagamento']);
            mov.saidas.forEach(s => {
                dados.push([`#${s.id}`, s.clientes?.nome || '-', `R$ ${(s.total || 0).toFixed(2)}`, s.forma_pagamento || '-']);
            });
            const totalSaidas = mov.saidas.reduce((sum, s) => sum + (s.total || 0), 0);
            dados.push(['Total', '', `R$ ${totalSaidas.toFixed(2)}`, '']);
            dados.push(['']);
            dados.push(['RESUMO']);
            dados.push(['Total Entradas', `R$ ${totalEntradas.toFixed(2)}`]);
            dados.push(['Total Saídas', `R$ ${totalSaidas.toFixed(2)}`]);
            dados.push(['Saldo', `R$ ${(totalEntradas - totalSaidas).toFixed(2)}`]);
            nomeArquivo = `movimento_diario_${mov.data}`;
            titulo = 'Movimento Diário';
            break;
            
        case 'faturamento':
            if (!dadosCarregados.faturamento || !dadosExportacao.faturamento) {
                mostrarNotificacao('Carregue o relatório de faturamento primeiro!', 'warning');
                return;
            }
            const fat = dadosExportacao.faturamento;
            dados = [
                ['RELATÓRIO DE FATURAMENTO'],
                [`Período: ${fat.plano}`],
                [''],
                ['Período', 'Valor (R$)', '% do Total']
            ];
            fat.labels.forEach((label, i) => {
                const percentual = fat.total > 0 ? ((fat.valores[i] / fat.total) * 100).toFixed(1) : 0;
                dados.push([label, `R$ ${fat.valores[i].toFixed(2)}`, `${percentual}%`]);
            });
            dados.push(['TOTAL', `R$ ${fat.total.toFixed(2)}`, '100%']);
            nomeArquivo = `faturamento_${new Date().toISOString().split('T')[0]}`;
            titulo = 'Faturamento';
            break;
            
        case 'vendas':
            if (!dadosCarregados.vendas || !dadosExportacao.vendas) {
                mostrarNotificacao('Carregue o relatório de vendas por produto primeiro!', 'warning');
                return;
            }
            const vend = dadosExportacao.vendas;
            dados = [
                ['RELATÓRIO DE VENDAS POR PRODUTO'],
                [`Período: ${vend.dataInicio || 'Início'} a ${vend.dataFim || 'Fim'}`],
                [''],
                ['Código', 'Produto', 'Categoria', 'Qtd Vendida', 'Total (R$)', '% do Total']
            ];
            vend.sorted.forEach(([nome, info]) => {
                const percentual = vend.totalGeral > 0 ? ((info.total / vend.totalGeral) * 100).toFixed(1) : 0;
                dados.push([info.codigo, nome, info.categoria, info.quantidade, `R$ ${info.total.toFixed(2)}`, `${percentual}%`]);
            });
            const totalQtd = vend.sorted.reduce((sum, item) => sum + item[1].quantidade, 0);
            dados.push(['TOTAL', '', '', totalQtd, `R$ ${vend.totalGeral.toFixed(2)}`, '100%']);
            nomeArquivo = `vendas_por_produto_${new Date().toISOString().split('T')[0]}`;
            titulo = 'Vendas por Produto';
            break;
            
        default:
            mostrarNotificacao('Tipo de exportação inválido', 'error');
            return;
    }
    
    if (dados.length === 0) {
        mostrarNotificacao('Nenhum dado para exportar', 'warning');
        return;
    }
    
    try {
        // Criar CSV com separador ponto e vírgula para melhor compatibilidade com Excel BR
        const csv = dados.map(row => row.join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `${nomeArquivo}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        mostrarNotificacao('Exportação concluída!', 'success');
    } catch (error) {
        console.error('Erro ao exportar Excel:', error);
        mostrarNotificacao('Erro ao exportar dados', 'error');
    }
}

function exportarPDF(tipo) {
    if (!temPermissao('relatorios', 'exportar')) {
        mostrarNotificacao('Você não tem permissão para exportar dados!', 'error');
        return;
    }
    
    let container = null;
    let nomeArquivo = '';
    let titulo = '';
    
    switch(tipo) {
        case 'movimento':
            if (!dadosCarregados.movimento) {
                mostrarNotificacao('Carregue o relatório de movimento primeiro!', 'warning');
                return;
            }
            container = document.getElementById('movimentoContainer');
            nomeArquivo = `movimento_diario_${dadosExportacao.movimento?.data || 'hoje'}`;
            titulo = 'Relatório de Movimento Diário';
            break;
        case 'faturamento':
            if (!dadosCarregados.faturamento) {
                mostrarNotificacao('Carregue o relatório de faturamento primeiro!', 'warning');
                return;
            }
            container = document.getElementById('faturamentoContainer');
            nomeArquivo = `faturamento_${new Date().toISOString().split('T')[0]}`;
            titulo = 'Relatório de Faturamento';
            break;
        case 'vendas':
            if (!dadosCarregados.vendas) {
                mostrarNotificacao('Carregue o relatório de vendas por produto primeiro!', 'warning');
                return;
            }
            container = document.getElementById('vendasProdutoContainer');
            nomeArquivo = `vendas_por_produto_${new Date().toISOString().split('T')[0]}`;
            titulo = 'Relatório de Vendas por Produto';
            break;
        default:
            mostrarNotificacao('Tipo de exportação inválido', 'error');
            return;
    }
    
    if (!container) {
        mostrarNotificacao('Container não encontrado', 'error');
        return;
    }
    
    // Verificar se o container tem conteúdo válido
    const conteudoHtml = container.innerHTML;
    if (!conteudoHtml || 
        conteudoHtml.includes('Carregando') || 
        conteudoHtml.includes('Nenhum') || 
        conteudoHtml.includes('Erro') ||
        conteudoHtml.trim() === '') {
        mostrarNotificacao('Nenhum dado válido para exportar!', 'warning');
        return;
    }
    
    // Mostrar loading no botão
    const btn = document.querySelector(`.btn-pdf[onclick*="${tipo}"]`) || 
                document.querySelector(`button:has(.btn-pdf)`);
    let textoOriginal = '';
    if (btn) {
        textoOriginal = btn.textContent;
        btn.textContent = '⏳ Gerando PDF...';
        btn.disabled = true;
    }
    
    try {
        // Clonar o conteúdo para não modificar o DOM
        const cloneContainer = container.cloneNode(true);
        
        // Criar elemento para o PDF
        const conteudoPDF = document.createElement('div');
        conteudoPDF.style.padding = '30px';
        conteudoPDF.style.fontFamily = 'Arial, Helvetica, sans-serif';
        conteudoPDF.style.backgroundColor = 'white';
        conteudoPDF.style.color = '#333';
        conteudoPDF.style.width = '100%';
        conteudoPDF.style.maxWidth = '1100px';
        conteudoPDF.style.margin = '0 auto';
        conteudoPDF.style.fontSize = '12px';
        
        // Adicionar cabeçalho
        conteudoPDF.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 3px solid #eb5e28; padding-bottom: 15px;">
                <h1 style="color: #eb5e28; font-size: 22px; margin: 0; text-transform: uppercase;">
                    📊 ${titulo}
                </h1>
                <p style="color: #666; font-size: 12px; margin: 5px 0 0 0;">
                    Gerado em: ${new Date().toLocaleString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
                <p style="color: #999; font-size: 11px; margin: 2px 0 0 0;">
                    Sistema de Estoque - Relatório
                </p>
            </div>
            <div style="margin-top: 15px;">
                ${cloneContainer.innerHTML}
            </div>
            <div style="text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; color: #999; font-size: 10px;">
                Documento gerado automaticamente pelo Sistema de Estoque
            </div>
        `;
        
        // Adicionar estilos para o PDF
        const style = document.createElement('style');
        style.textContent = `
            body { font-family: Arial, Helvetica, sans-serif; }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                font-size: 11px;
                margin: 10px 0;
            }
            th { 
                background-color: #eb5e28; 
                color: white; 
                padding: 8px 10px; 
                text-align: left;
                font-weight: bold;
            }
            td { 
                padding: 6px 10px; 
                border-bottom: 1px solid #e0e0e0;
                vertical-align: middle;
            }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .total-row { 
                background-color: #f0f0f0 !important; 
                font-weight: bold;
            }
            .total-row td { border-top: 2px solid #333; }
            .table-relatorio { width: 100%; }
            h4 { 
                color: #333; 
                margin: 20px 0 10px 0;
                font-size: 14px;
            }
            .kpi-card, .dashboard-kpi, [style*="display: grid"] {
                margin-bottom: 15px;
            }
            [style*="background:"] {
                border-radius: 8px;
            }
        `;
        conteudoPDF.prepend(style);
        
        // Configurar opções do PDF
        const options = {
            margin: [10, 10, 10, 10],
            filename: `${nomeArquivo}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                logging: true,
                backgroundColor: '#ffffff',
                allowTaint: true,
                windowWidth: 1200
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait'
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        // Adicionar ao DOM temporariamente
        conteudoPDF.style.position = 'fixed';
        conteudoPDF.style.left = '0';
        conteudoPDF.style.top = '0';
        conteudoPDF.style.zIndex = '-1';
        conteudoPDF.style.width = '210mm';
        conteudoPDF.style.background = '#fff';

        document.body.appendChild(conteudoPDF);
                
        // Gerar PDF
        html2pdf()
            .set(options)
            .from(conteudoPDF)
            .save()
            .then(() => {
                mostrarNotificacao('PDF gerado com sucesso!', 'success');
            })
            .catch((error) => {
                console.error('Erro ao gerar PDF:', error);
                mostrarNotificacao('Erro ao gerar PDF. Tente novamente!', 'error');
            })
            .finally(() => {

                // Aguarda o html2pdf finalizar totalmente antes de remover
                setTimeout(() => {

                    // Remover elemento temporário
                    if (conteudoPDF && conteudoPDF.parentNode) {
                        document.body.removeChild(conteudoPDF);
                    }

                    // Restaurar botão
                    if (btn) {
                        btn.textContent = textoOriginal;
                        btn.disabled = false;
                    }

                }, 1000);

            });
            
    } catch (error) {
        console.error('Erro ao preparar PDF:', error);
        mostrarNotificacao('Erro ao gerar PDF', 'error');
        if (btn) {
            btn.textContent = textoOriginal;
            btn.disabled = false;
        }
    }
}

// =====================================================
// UTILITÁRIOS
// =====================================================

Date.prototype.getWeek = function() {
    const date = new Date(this);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

function mostrarNotificacao(mensagem, tipo = 'info') {
    // Verificar se já existe um container de notificações
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 350px;
        `;
        document.body.appendChild(container);
    }
    
    const cores = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    const notificacao = document.createElement('div');
    notificacao.style.cssText = `
        background: white;
        border-left: 4px solid ${cores[tipo] || cores.info};
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        color: #333;
        animation: slideIn 0.3s ease;
        font-family: Arial, sans-serif;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    
    const icones = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notificacao.innerHTML = `
        <span style="font-size: 18px;">${icones[tipo] || 'ℹ️'}</span>
        <span>${mensagem}</span>
        <button onclick="this.parentElement.remove()" style="
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #999;
            margin-left: auto;
            padding: 0 5px;
        ">×</button>
    `;
    
    container.appendChild(notificacao);
    
    // Remover automaticamente após 5 segundos
    setTimeout(() => {
        if (notificacao.parentNode) {
            notificacao.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notificacao.parentNode) {
                    notificacao.remove();
                }
            }, 300);
        }
    }, 5000);
}

// Adicionar animações CSS
const styleAnimations = document.createElement('style');
styleAnimations.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(styleAnimations);

// Exportar funções para uso global
window.abrirAba = abrirAba;
window.carregarMovimentoDiario = carregarMovimentoDiario;
window.carregarFaturamento = carregarFaturamento;
window.carregarVendasProduto = carregarVendasProduto;
window.exportarExcel = exportarExcel;
window.exportarPDF = exportarPDF;