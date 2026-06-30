// js/dashboard.js
// js/clientes.js (exemplo)
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se tem permissão para ver clientes
    if (!temPermissao('clientes', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    // Resto do código...
});
// Dashboard principal com tratamento de erros de permissão

let vendasChart = null;
let topProdutosChart = null;

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    const usuario = getUsuarioLogado();
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Mostrar nome do usuário
    const userNameElement = document.getElementById('userName');
    const userPerfilElement = document.getElementById('userPerfil');
    if (userNameElement) userNameElement.textContent = usuario.nome;
    if (userPerfilElement) {
        const perfilLabels = {
            admin: '👑 Administrador',
            gerente: '📊 Gerente',
            vendedor: '💰 Vendedor',
            tecnico: '🔧 Técnico',
            basico: '👤 Básico'
        };
        userPerfilElement.textContent = perfilLabels[usuario.perfil] || usuario.perfil;
    }
    
    // Menu toggle (mobile)
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });
    }
    

    
    // =====================================================
    // FUNÇÕES AUXILIARES
    // =====================================================
    
    function getDataInicioDia() {
        const data = new Date();
        data.setHours(0, 0, 0, 0);
        return data.toISOString();
    }
    
    function getDataInicioSemana() {
        const data = new Date();
        data.setDate(data.getDate() - data.getDay());
        data.setHours(0, 0, 0, 0);
        return data.toISOString();
    }
    
    function getDataInicioMes() {
        const data = new Date();
        data.setDate(1);
        data.setHours(0, 0, 0, 0);
        return data.toISOString();
    }
    
    function getDataInicioAno() {
        const data = new Date();
        data.setMonth(0, 1);
        data.setHours(0, 0, 0, 0);
        return data.toISOString();
    }
    
    // =====================================================
    // CARREGAR MÉTRICAS DO DASHBOARD
    // =====================================================
    
    async function carregarDashboard() {
        try {
            // Verificar se o usuário tem permissão para ver o dashboard
            if (!temPermissao('dashboard', 'ver')) {
                document.querySelector('.content').innerHTML = `
                    <div style="text-align: center; padding: 50px;">
                        <h2>🔒 Acesso Negado</h2>
                        <p>Você não tem permissão para acessar o Dashboard.</p>
                    </div>
                `;
                return;
            }
            
            // Buscar produtos - com tratamento de erro
            let produtosData = [];
            try {
                const { data, error } = await supabaseClient.from('produtos').select('*');
                if (!error && data) {
                    produtosData = data;
                } else {
                    console.warn('Erro ao buscar produtos:', error);
                }
            } catch (e) {
                console.warn('Erro ao buscar produtos:', e);
            }
            
            // Buscar clientes - com tratamento de erro
            let clientesCount = 0;
            try {
                const { count, error } = await supabaseClient
                    .from('clientes')
                    .select('id', { count: 'exact', head: true });
                if (!error && count !== null) {
                    clientesCount = count;
                }
            } catch (e) {
                console.warn('Erro ao buscar clientes:', e);
            }
            
            // Atualizar cards
            const totalEstoque = produtosData.reduce((sum, p) => sum + (p.estoque_total || p.estoque || 0), 0);
            const estoqueBaixo = produtosData.filter(p => (p.estoque_total || p.estoque || 0) < (p.estoque_minimo || 5)).length;
            
            document.getElementById('totalProdutos').textContent = produtosData.length;
            document.getElementById('totalEstoque').textContent = totalEstoque;
            document.getElementById('estoqueBaixo').textContent = estoqueBaixo;
            document.getElementById('totalClientes').textContent = clientesCount;
            
            // Carregar métricas de vendas - com tratamento de erro
            await carregarMetricasVendas();
            
            // Carregar totais financeiros - com tratamento de erro
            await carregarTotaisFinanceiros();
            
            // Carregar movimentações recentes - com tratamento de erro
            await carregarMovimentacoesRecentes();
            
            // Carregar gráficos - com tratamento de erro
            await carregarGraficos();
            
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            mostrarNotificacao('Erro ao carregar alguns dados. Tente novamente.', 'warning');
        }
    }
    
    async function carregarMetricasVendas() {
        try {
            // Buscar todas as saídas (vendas)
            const { data: saidas, error } = await supabaseClient
                .from('saidas')
                .select('data, total');
            
            if (error || !saidas) {
                console.warn('Erro ao carregar vendas:', error);
                return;
            }
            
            const dataInicioDia = getDataInicioDia();
            const dataInicioSemana = getDataInicioSemana();
            const dataInicioMes = getDataInicioMes();
            const dataInicioAno = getDataInicioAno();
            
            let vendasHoje = 0;
            let vendasSemana = 0;
            let vendasMes = 0;
            let vendasAno = 0;
            
            saidas.forEach(venda => {
                const valor = venda.total || 0;
                const dataVenda = new Date(venda.data);
                
                if (dataVenda >= new Date(dataInicioDia)) vendasHoje += valor;
                if (dataVenda >= new Date(dataInicioSemana)) vendasSemana += valor;
                if (dataVenda >= new Date(dataInicioMes)) vendasMes += valor;
                if (dataVenda >= new Date(dataInicioAno)) vendasAno += valor;
            });
            
            document.getElementById('vendasHoje').textContent = `R$ ${vendasHoje.toFixed(2)}`;
            document.getElementById('vendasSemana').textContent = `R$ ${vendasSemana.toFixed(2)}`;
            document.getElementById('vendasMes').textContent = `R$ ${vendasMes.toFixed(2)}`;
            document.getElementById('vendasAno').textContent = `R$ ${vendasAno.toFixed(2)}`;
            
        } catch (error) {
            console.error('Erro ao carregar métricas de vendas:', error);
            // Valores padrão
            document.getElementById('vendasHoje').textContent = 'R$ 0,00';
            document.getElementById('vendasSemana').textContent = 'R$ 0,00';
            document.getElementById('vendasMes').textContent = 'R$ 0,00';
            document.getElementById('vendasAno').textContent = 'R$ 0,00';
        }
    }
    
    async function carregarTotaisFinanceiros() {
        try {
            // Buscar entradas
            let totalEntradas = 0;
            try {
                const { data } = await supabaseClient.from('entradas').select('total');
                if (data) {
                    totalEntradas = data.reduce((sum, e) => sum + (e.total || 0), 0);
                }
            } catch (e) {
                console.warn('Erro ao buscar entradas:', e);
            }
            
            // Buscar saídas
            let totalSaidas = 0;
            try {
                const { data } = await supabaseClient.from('saidas').select('total');
                if (data) {
                    totalSaidas = data.reduce((sum, s) => sum + (s.total || 0), 0);
                }
            } catch (e) {
                console.warn('Erro ao buscar saidas:', e);
            }
            
            const lucroTotal = totalSaidas - totalEntradas;
            
            document.getElementById('totalEntradas').textContent = `R$ ${totalEntradas.toFixed(2)}`;
            document.getElementById('totalSaidas').textContent = `R$ ${totalSaidas.toFixed(2)}`;
            document.getElementById('totalCompras').textContent = `R$ ${totalEntradas.toFixed(2)}`;
            document.getElementById('lucroTotal').textContent = `R$ ${lucroTotal.toFixed(2)}`;
            
        } catch (error) {
            console.error('Erro ao carregar totais financeiros:', error);
            document.getElementById('totalEntradas').textContent = 'R$ 0,00';
            document.getElementById('totalSaidas').textContent = 'R$ 0,00';
            document.getElementById('totalCompras').textContent = 'R$ 0,00';
            document.getElementById('lucroTotal').textContent = 'R$ 0,00';
        }
    }
    
    async function carregarMovimentacoesRecentes() {
        try {
            // Buscar últimas 10 movimentações
            const { data: movimentacoes, error } = await supabaseClient
                .from('movimentos_estoque')
                .select(`
                    *,
                    produtos (nome, codigo)
                `)
                .order('data', { ascending: false })
                .limit(10);
            
            if (error || !movimentacoes) {
                console.warn('Erro ao carregar movimentações:', error);
                document.getElementById('movimentacoesRecentes').innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma movimentação recente</div>';
                return;
            }
            
            const container = document.getElementById('movimentacoesRecentes');
            
            if (movimentacoes.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma movimentação recente</div>';
                return;
            }
            
            container.innerHTML = movimentacoes.map(mov => {
                const tipoIcon = mov.tipo === 'entrada' ? '📥' : mov.tipo === 'saida' ? '📤' : '✏️';
                const tipoText = mov.tipo === 'entrada' ? 'Entrada' : mov.tipo === 'saida' ? 'Saída' : 'Ajuste';
                const valorClass = mov.tipo === 'entrada' ? '' : 'negative';
                
                return `
                    <div class="recent-item">
                        <div class="info">
                            <div class="title">${tipoIcon} ${tipoText} - ${mov.produtos?.nome || 'Produto'}</div>
                            <div class="date">${new Date(mov.data).toLocaleString('pt-BR')}</div>
                        </div>
                        <div class="value ${valorClass}">${mov.quantidade} unid.</div>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Erro ao carregar movimentações:', error);
            document.getElementById('movimentacoesRecentes').innerHTML = '<div style="text-align: center; padding: 20px;">Erro ao carregar movimentações</div>';
        }
    }
    
    async function carregarGraficos() {
        try {
            // Gráfico de vendas por mês
            let vendasData = [];
            try {
                const { data } = await supabaseClient
                    .from('saidas')
                    .select('data, total')
                    .order('data', { ascending: true });
                if (data) vendasData = data;
            } catch (e) {
                console.warn('Erro ao buscar dados para gráfico:', e);
            }
            
            if (vendasData.length > 0) {
                const vendasPorMes = {};
                vendasData.forEach(venda => {
                    const mes = new Date(venda.data).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    vendasPorMes[mes] = (vendasPorMes[mes] || 0) + (venda.total || 0);
                });
                
                const labels = Object.keys(vendasPorMes);
                const valores = Object.values(vendasPorMes);
                
                const ctxVendas = document.getElementById('vendasChart');
                if (ctxVendas) {
                    if (vendasChart) vendasChart.destroy();
                    vendasChart = new Chart(ctxVendas, {
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
                            plugins: {
                                legend: { position: 'top' }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: (value) => 'R$ ' + value.toFixed(2)
                                    }
                                }
                            }
                        }
                    });
                }
            }
            
            // Gráfico de produtos mais vendidos
            let itensVendidos = [];
            try {
                const { data } = await supabaseClient
                    .from('saida_itens')
                    .select(`
                        quantidade,
                        produtos (id, nome)
                    `);
                if (data) itensVendidos = data;
            } catch (e) {
                console.warn('Erro ao buscar produtos vendidos:', e);
            }
            
            if (itensVendidos.length > 0) {
                const produtosVendidos = {};
                itensVendidos.forEach(item => {
                    const nome = item.produtos?.nome || 'Produto';
                    produtosVendidos[nome] = (produtosVendidos[nome] || 0) + (item.quantidade || 0);
                });
                
                const top5 = Object.entries(produtosVendidos)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                
                const ctxTop = document.getElementById('topProdutosChart');
                if (ctxTop && top5.length > 0) {
                    if (topProdutosChart) topProdutosChart.destroy();
                    topProdutosChart = new Chart(ctxTop, {
                        type: 'bar',
                        data: {
                            labels: top5.map(item => item[0]),
                            datasets: [{
                                label: 'Quantidade Vendida',
                                data: top5.map(item => item[1]),
                                backgroundColor: '#eb5e28',
                                borderRadius: 8
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: { stepSize: 1 }
                                }
                            }
                        }
                    });
                }
            }
            
        } catch (error) {
            console.error('Erro ao carregar gráficos:', error);
        }
    }
    
    // Inicializar
    carregarDashboard();
});