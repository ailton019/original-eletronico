
// js/saidas.js — PDV Sistema de Estoque (versão completa corrigida)

document.addEventListener('DOMContentLoaded', () => {

    // =====================================================
    // FUNÇÕES AUXILIARES
    // =====================================================

    function getDataLocalBrasil() {
        const hoje = new Date();
        const dataStr = hoje.toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const partes = dataStr.split('/');
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }

    function formatarData(data) {
        if (!data) return '-';
        const partes = data.substring(0, 10).split('-');
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', currency: 'BRL'
        }).format(valor || 0);
    }

    function podeCancelarVenda(dataFinalizacao) {
        if (!dataFinalizacao) return false;
        const diff = (new Date() - new Date(dataFinalizacao)) / (1000 * 60 * 60);
        return diff <= 2;
    }

    function verificarPermissaoModulo(modulo, acao = 'ver') {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        if (!usuario) return false;
        if (usuario.perfil === 'admin') return true;
        const permissoes = usuario.permissoes || {};
        return permissoes[modulo]?.[acao] || false;
    }

    // =====================================================
    // AUTENTICAÇÃO
    // =====================================================

    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    if (!verificarPermissaoModulo('saidas', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align:center;padding:50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>`;
        return;
    }

    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador', gerente: '📊 Gerente',
        vendedor: '💰 Vendedor', tecnico: '🔧 Técnico', basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil;

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });

    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // =====================================================
    // VARIÁVEIS GLOBAIS
    // =====================================================

    let produtos = [];
    let clientes = [];
    let configLoja = {};
    let carrinho = [];
    let formaPagamentoSelecionada = null;
    let produtoSerialPendente = null;
    let seriaisDisponiveis = [];
    let searchTimer = null;

    // =====================================================
    // CARREGAR DADOS
    // ✅ FIX: removido .eq('ativo', true) — substitído por
    //    .neq('ativo', false) para incluir produtos com ativo=null
    // =====================================================

    async function carregarDados() {
        try {
            const [produtosRes, clientesRes, configRes, vendasRes] = await Promise.all([
                supabaseClient
                    .from('produtos')
                    .select('*')
                    .neq('ativo', false)          // ✅ inclui null e true
                    .order('nome', { ascending: true }),
                supabaseClient
                    .from('clientes')
                    .select('*')
                    .order('nome'),
                supabaseClient
                    .from('config_loja')
                    .select('*')
                    .limit(1),
                supabaseClient
                    .from('saidas')
                    .select('*, clientes(nome)')
                    .order('id', { ascending: false })
                    .limit(100)
            ]);

            produtos   = produtosRes.data  || [];
            clientes   = clientesRes.data  || [];
            configLoja = configRes.data?.[0] || {};

            // Contador de produtos
            const contador = document.getElementById('contadorProdutos');
            if (contador) contador.textContent = `(${produtos.length} disponíveis)`;

            renderizarProdutos(produtos);
            renderizarVendas(vendasRes.data || []);

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            mostrarNotificacao('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    // =====================================================
    // RENDERIZAR PRODUTOS
    // =====================================================

    function renderizarProdutos(lista) {
        const container = document.getElementById('produtosList');
        if (!container) return;

        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:30px;color:var(--gray);">
                    <div style="font-size:32px;margin-bottom:8px;">📦</div>
                    <div>Nenhum produto encontrado</div>
                </div>`;
            return;
        }

        container.innerHTML = lista.map(p => {
            const estoque = p.estoque_total ?? p.estoque ?? 0;
            const semEstoque = estoque <= 0;

            let estoqueBadge = '';
            if (semEstoque)      estoqueBadge = '<span class="estoque-badge estoque-zero">Sem estoque</span>';
            else if (estoque <= 5) estoqueBadge = `<span class="estoque-badge estoque-baixo">${estoque} un</span>`;
            else                   estoqueBadge = `<span class="estoque-badge estoque-ok">${estoque} un</span>`;

            // Badge para match de serial/IMEI
            const serialBadge = p._serialMatch
                ? `<br><small style="color:#2563eb;font-weight:600;">🔢 Serial/IMEI: ${p._serialMatch}</small>`
                : '';

            return `
                <div class="produto-item ${semEstoque ? 'sem-estoque' : ''}"
                     ${semEstoque ? '' : `onclick="selecionarProduto(${p.id})"`}>
                    <div class="produto-info">
                        <h4>${p.nome}</h4>
                        <small>Cód: ${p.codigo || p.id} ${estoqueBadge}
                            ${p.categoria ? `| ${p.categoria}` : ''}
                        </small>
                        ${serialBadge}
                    </div>
                    <div class="produto-preco">${formatarMoeda(p.valor_venda)}</div>
                </div>`;
        }).join('');
    }

    // =====================================================
    // BUSCA COM SUPORTE A IMEI / SERIAL
    // ✅ NOVO: pesquisa na tabela produtos_seriais em paralelo
    // =====================================================

    document.getElementById('searchProdutoVenda')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const termo = e.target.value.trim();
        searchTimer = setTimeout(() => filtrarProdutos(termo), 280);
    });

    async function filtrarProdutos(termo) {
        if (!termo) {
            renderizarProdutos(produtos);
            return;
        }

        const termoLower = termo.toLowerCase();

        // 1. Filtro local: nome e código
        const porNomeCodigo = produtos.filter(p =>
            p.nome?.toLowerCase().includes(termoLower) ||
            (p.codigo || '').toLowerCase().includes(termoLower)
        );

        // 2. Busca assíncrona por IMEI / Serial no banco
        let porSerial = [];
        try {
            const { data: seriais } = await supabaseClient
                .from('produtos_seriais')
                .select('produto_id, numero_serie, imei')
                .or(`numero_serie.ilike.%${termo}%,imei.ilike.%${termo}%`)
                .eq('status', 'disponivel')
                .limit(20);

            if (seriais && seriais.length > 0) {
                const idsSerial = [...new Set(seriais.map(s => s.produto_id))];
                porSerial = produtos
                    .filter(p => idsSerial.includes(p.id))
                    .map(p => {
                        const match = seriais.find(s => s.produto_id === p.id);
                        return { ...p, _serialMatch: match?.numero_serie || match?.imei };
                    });
            }
        } catch (e) {
            // Tabela pode não existir — silencioso
        }

        // 3. Mesclar sem duplicatas
        const idsLocais = new Set(porNomeCodigo.map(p => p.id));
        const extras = porSerial.filter(p => !idsLocais.has(p.id));
        renderizarProdutos([...porNomeCodigo, ...extras]);
    }

    // =====================================================
    // RENDERIZAR VENDAS
    // =====================================================

    function renderizarVendas(vendas) {
        const tbody = document.getElementById('vendasTableBody');
        if (!tbody) return;

        if (!vendas || vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray);">Nenhuma venda encontrada</td></tr>';
            return;
        }

        const podeCancelar = verificarPermissaoModulo('saidas', 'cancelar');

        tbody.innerHTML = vendas.map(v => {
            const cancelado = v.cancelado || false;
            const podeCanc  = podeCancelar && !cancelado && podeCancelarVenda(v.data_finalizacao);

            const statusHtml = cancelado
                ? '<span class="status-estoque status-critico">❌ Cancelada</span>'
                : '<span class="status-estoque status-normal">✅ Ativa</span>';

            return `
                <tr>
                    <td><strong>#${v.id}</strong></td>
                    <td>${formatarData(v.data)}</td>
                    <td>${v.clientes?.nome || '<span style="color:#9ca3af">—</span>'}</td>
                    <td><strong style="color:var(--primary)">${formatarMoeda(v.total)}</strong></td>
                    <td>${v.forma_pagamento || '—'}</td>
                    <td>${statusHtml}</td>
                    <td class="table-actions" style="white-space:nowrap;">
                        <button class="btn-info" onclick="verComprovante(${v.id})" title="Ver Comprovante">📄</button>
                        ${podeCanc ? `<button class="btn-danger" onclick="cancelarVenda(${v.id})" style="margin-left:4px;" title="Cancelar Venda">❌ Cancelar</button>` : ''}
                        ${cancelado && v.cancelado_em ? `<small style="color:#999;font-size:10px;display:block;margin-top:3px;">Cancelado: ${new Date(v.cancelado_em).toLocaleString('pt-BR')}</small>` : ''}
                    </td>
                </tr>`;
        }).join('');
    }

    // =====================================================
    // BUSCA DE CLIENTES
    // =====================================================

    const searchClienteEl = document.getElementById('searchCliente');
    const clienteSuggestionsEl = document.getElementById('clienteSuggestions');

    searchClienteEl?.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        if (termo.length < 2) { clienteSuggestionsEl.style.display = 'none'; return; }

        const filtrados = clientes.filter(c =>
            c.nome?.toLowerCase().includes(termo) ||
            c.cpf_cnpj?.includes(termo) ||
            c.telefone?.includes(termo) ||
            (c.codigo && c.codigo.toString().includes(termo))
        );

        if (filtrados.length === 0) {
            clienteSuggestionsEl.innerHTML = '<div class="cliente-suggestion-item">Nenhum cliente encontrado</div>';
        } else {
            clienteSuggestionsEl.innerHTML = filtrados.slice(0, 8).map(c => `
                <div class="cliente-suggestion-item"
                     onclick="selecionarCliente(${c.id}, '${(c.nome||'').replace(/'/g,"\\'")}', '${c.cpf_cnpj||''}')">
                    <strong>${c.nome}</strong><br>
                    <small>${c.cpf_cnpj || 'Sem documento'} | ${c.telefone || 'Sem telefone'}</small>
                </div>`).join('');
        }
        clienteSuggestionsEl.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-cliente')) {
            clienteSuggestionsEl.style.display = 'none';
        }
    });

    window.selecionarCliente = (id, nome, documento) => {
        document.getElementById('clienteId').value = id;
        document.getElementById('searchCliente').value = nome;
        document.getElementById('clienteSelecionado').innerHTML =
            `✅ <strong>${nome}</strong>${documento ? ` (${documento})` : ''}`;
        clienteSuggestionsEl.style.display = 'none';
    };

    // =====================================================
    // FORMAS DE PAGAMENTO
    // ✅ FIX: listener definido UMA VEZ fora do carregarDados
    // =====================================================

    document.querySelectorAll('.btn-pagamento').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-pagamento').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            formaPagamentoSelecionada = btn.getAttribute('data-pagamento');
        });
    });

    // =====================================================
    // SELEÇÃO DE PRODUTO / SERIAL
    // =====================================================

    window.selecionarProduto = async (produtoId) => {
        if (!verificarPermissaoModulo('saidas', 'criar')) {
            mostrarNotificacao('Você não tem permissão para adicionar produtos!', 'error');
            return;
        }

        const produto = produtos.find(p => p.id === produtoId);
        if (!produto) { mostrarNotificacao('Produto não encontrado!', 'error'); return; }

        const estoque = produto.estoque_total ?? produto.estoque ?? 0;
        if (estoque <= 0) { mostrarNotificacao('Produto sem estoque disponível!', 'error'); return; }

        let exigeSerial = false;
        try {
            const { data: categoria } = await supabaseClient
                .from('categorias')
                .select('exige_serial')
                .eq('nome', produto.categoria)
                .maybeSingle();
            exigeSerial = categoria?.exige_serial === true || produto.categoria === 'Celular';
        } catch {
            exigeSerial = produto.categoria === 'Celular';
        }

        if (exigeSerial) {
            const { data: seriais, error } = await supabaseClient
                .from('produtos_seriais')
                .select('*')
                .eq('produto_id', produtoId)
                .eq('status', 'disponivel');

            if (error) { mostrarNotificacao('Erro ao verificar seriais!', 'error'); return; }

            produtoSerialPendente = produto;
            seriaisDisponiveis    = seriais || [];

            document.getElementById('serialProdutoNome').value = produto.nome;
            document.getElementById('numeroSerie').value = '';

            const container = document.getElementById('seriaisDisponiveis');
            if (seriaisDisponiveis.length === 0) {
                container.innerHTML = '<p style="color:#dc2626;font-size:13px;">⚠️ Nenhum número de série disponível!</p>';
            } else {
                container.innerHTML = `
                    <strong>📱 Seriais disponíveis (${seriaisDisponiveis.length} un.):</strong>
                    <ul style="margin-top:10px;max-height:150px;overflow-y:auto;padding:0;list-style:none;">
                        ${seriaisDisponiveis.map(s => `
                            <li onclick="selecionarSerial('${s.numero_serie}')"
                                style="padding:8px;border-bottom:1px solid #eee;cursor:pointer;
                                       display:flex;justify-content:space-between;align-items:center;border-radius:4px;"
                                onmouseover="this.style.background='#f0f9ff'"
                                onmouseout="this.style.background=''">
                                <div>
                                    <code>${s.numero_serie || 'N/A'}</code>
                                    ${s.imei ? `<br><small>IMEI: ${s.imei}</small>` : ''}
                                </div>
                                <button style="background:#2563eb;color:#fff;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;">
                                    Selecionar
                                </button>
                            </li>`).join('')}
                    </ul>
                    <small style="color:var(--gray);margin-top:8px;display:block;">
                        📝 Digite ou clique no serial acima para selecionar
                    </small>`;
            }

            document.getElementById('modalSerial').style.display = 'flex';
            document.getElementById('numeroSerie').focus();
        } else {
            adicionarAoCarrinho(produto, null);
        }
    };

    window.selecionarSerial = (serial) => {
        document.getElementById('numeroSerie').value = serial;
        document.getElementById('btnConfirmarSerial').click();
    };

    document.getElementById('btnConfirmarSerial')?.addEventListener('click', async () => {
        const numeroSerie = document.getElementById('numeroSerie').value.trim();

        if (!numeroSerie && seriaisDisponiveis.length > 0) {
            mostrarNotificacao('Informe o número de série!', 'error');
            return;
        }

        const serial = seriaisDisponiveis.find(s =>
            s.numero_serie === numeroSerie || s.imei === numeroSerie
        );

        if (seriaisDisponiveis.length > 0 && !serial) {
            mostrarNotificacao('Número de série inválido!', 'error');
            return;
        }

        if (produtoSerialPendente) adicionarAoCarrinho(produtoSerialPendente, serial || null);

        document.getElementById('modalSerial').style.display = 'none';
        produtoSerialPendente = null;
    });

    document.getElementById('btnCancelarSerial')?.addEventListener('click', () => {
        document.getElementById('modalSerial').style.display = 'none';
        produtoSerialPendente = null;
    });

    document.getElementById('numeroSerie')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnConfirmarSerial').click();
    });

    // =====================================================
    // CARRINHO
    // =====================================================

    function adicionarAoCarrinho(produto, serial) {
        const estoque = produto.estoque_total ?? produto.estoque ?? 0;

        // Calcular a quantidade total deste produto já adicionada ao carrinho
        const totalNoCarrinho = carrinho
            .filter(item => item.id === produto.id)
            .reduce((sum, item) => sum + item.quantidade, 0);

        if (totalNoCarrinho + 1 > estoque) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoque} (Já no carrinho: ${totalNoCarrinho})`, 'error');
            return;
        }

        if (serial) {
            // Verificar se o serial selecionado já está no carrinho
            const serialNoCarrinho = carrinho.find(item => item.serial_id === serial.id);
            if (serialNoCarrinho) {
                mostrarNotificacao('Este número de série/IMEI já está no carrinho!', 'error');
                return;
            }
        }

        const itemExistente = carrinho.find(item =>
            item.id === produto.id &&
            (!serial || item.serial === serial?.numero_serie)
        );

        if (itemExistente) {
            if (serial) {
                mostrarNotificacao('Este número de série/IMEI já está no carrinho!', 'error');
                return;
            }
            itemExistente.quantidade++;
            itemExistente.subtotal = itemExistente.quantidade * itemExistente.valor_venda;
        } else {
            carrinho.push({
                id:          produto.id,
                nome:        produto.nome,
                codigo:      produto.codigo,
                categoria:   produto.categoria,
                valor_venda: produto.valor_venda || 0,
                quantidade:  1,
                subtotal:    produto.valor_venda || 0,
                serial:      serial?.numero_serie || null,
                imei:        serial?.imei || null,
                serial_id:   serial?.id || null
            });
        }

        renderizarCarrinho();
        calcularTotais();
        mostrarNotificacao(`${produto.nome} adicionado ao carrinho!`, 'success');
    }

    function renderizarCarrinho() {
        const container = document.getElementById('carrinhoItems');
        if (!container) return;

        if (carrinho.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:20px;color:var(--gray);">
                    Clique nos produtos da lista para adicionar à venda
                </div>`;
            return;
        }

        container.innerHTML = carrinho.map((item, index) => `
            <div class="carrinho-item">
                <div>
                    <strong>${item.nome}</strong><br>
                    <small>Cód: ${item.codigo || item.id}</small>
                    ${item.serial ? `<br><small style="color:#2563eb;">🔢 Serial: <code>${item.serial}</code></small>` : ''}
                    ${item.imei   ? `<br><small style="color:#6b7280;">📱 IMEI: ${item.imei}</small>` : ''}
                </div>
                <div>${formatarMoeda(item.valor_venda)}</div>
                <div>
                    <input type="number" min="1" value="${item.quantidade}"
                           onchange="atualizarQuantidade(${index}, this.value)"
                           style="width:60px;padding:5px;text-align:center;border:1px solid var(--border);border-radius:4px;"
                           ${item.serial_id ? 'disabled' : ''}>
                </div>
                <div><strong>${formatarMoeda(item.subtotal)}</strong></div>
                <button class="btn-remover" onclick="removerDoCarrinho(${index})">✕</button>
            </div>`).join('');
    }

    window.atualizarQuantidade = (index, quantidade) => {
        quantidade = parseInt(quantidade);
        if (isNaN(quantidade) || quantidade < 1) quantidade = 1;

        const cartItem = carrinho[index];
        if (cartItem.serial_id) {
            mostrarNotificacao('Produtos com número de série têm quantidade limitada a 1!', 'error');
            cartItem.quantidade = 1;
            cartItem.subtotal = cartItem.valor_venda;
            renderizarCarrinho();
            calcularTotais();
            return;
        }

        const produto = produtos.find(p => p.id === cartItem.id);
        const estoque = produto ? (produto.estoque_total ?? produto.estoque ?? 0) : 999;

        if (quantidade > estoque) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoque}`, 'error');
            quantidade = estoque;
        }

        cartItem.quantidade = quantidade;
        cartItem.subtotal   = quantidade * cartItem.valor_venda;
        renderizarCarrinho();
        calcularTotais();
    };

    window.removerDoCarrinho = (index) => {
        carrinho.splice(index, 1);
        renderizarCarrinho();
        calcularTotais();
    };

    function calcularTotais() {
        const subtotal  = carrinho.reduce((s, i) => s + i.subtotal, 0);
        const desconto  = parseFloat(document.getElementById('desconto')?.value)  || 0;
        const acrescimo = parseFloat(document.getElementById('acrescimo')?.value) || 0;
        const total     = Math.max(0, subtotal - desconto + acrescimo);

        if (document.getElementById('subtotal'))      document.getElementById('subtotal').textContent      = formatarMoeda(subtotal);
        if (document.getElementById('valorDesconto')) document.getElementById('valorDesconto').textContent = formatarMoeda(desconto);
        if (document.getElementById('valorAcrescimo'))document.getElementById('valorAcrescimo').textContent= formatarMoeda(acrescimo);
        if (document.getElementById('total'))         document.getElementById('total').textContent         = formatarMoeda(total);
    }

    document.getElementById('desconto')?.addEventListener('input',  calcularTotais);
    document.getElementById('acrescimo')?.addEventListener('input', calcularTotais);

    // =====================================================
    // LIMPAR FORMULÁRIO
    // =====================================================

    function limparFormulario() {
        carrinho = [];
        renderizarCarrinho();
        calcularTotais();

        document.getElementById('clienteId').value         = '';
        document.getElementById('searchCliente').value     = '';
        document.getElementById('clienteSelecionado').innerHTML = '';
        document.getElementById('desconto').value          = '0';
        document.getElementById('acrescimo').value         = '0';
        document.getElementById('observacao').value        = '';
        document.getElementById('searchProdutoVenda').value = '';

        document.querySelectorAll('.btn-pagamento').forEach(b => b.classList.remove('selected'));
        formaPagamentoSelecionada = null;

        renderizarProdutos(produtos);
    }

    document.getElementById('btnLimparVenda')?.addEventListener('click', () => {
        if (carrinho.length > 0 && !confirm('Deseja limpar o carrinho?')) return;
        limparFormulario();
    });

    // =====================================================
    // FINALIZAR VENDA
    // =====================================================

    async function finalizarVenda() {
        if (!verificarPermissaoModulo('saidas', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar vendas!', 'error');
            return;
        }

        if (carrinho.length === 0) {
            mostrarNotificacao('Adicione pelo menos um produto ao carrinho!', 'error');
            return;
        }

        if (!formaPagamentoSelecionada) {
            mostrarNotificacao('Selecione a forma de pagamento!', 'error');
            return;
        }

        const clienteId  = document.getElementById('clienteId').value;
        const desconto   = parseFloat(document.getElementById('desconto').value)  || 0;
        const acrescimo  = parseFloat(document.getElementById('acrescimo').value) || 0;
        const observacao = document.getElementById('observacao').value;
        const subtotal   = carrinho.reduce((s, i) => s + i.subtotal, 0);
        const total      = Math.max(0, subtotal - desconto + acrescimo);

        const btnFinalizar = document.getElementById('btnFinalizarVenda');
        if (btnFinalizar) { btnFinalizar.disabled = true; btnFinalizar.textContent = '⏳ Processando...'; }

        try {
            const dataVenda = getDataLocalBrasil();

            const { data: venda, error: vendaError } = await supabaseClient
                .from('saidas')
                .insert([{
                    cliente_id:       clienteId || null,
                    data:             dataVenda,
                    total:            total,
                    desconto:         desconto,
                    forma_pagamento:  formaPagamentoSelecionada,
                    observacao:       observacao
                        ? `${observacao} | Acréscimo: R$ ${acrescimo.toFixed(2)}`
                        : acrescimo > 0 ? `Acréscimo: R$ ${acrescimo.toFixed(2)}` : null,
                    usuario_id:       usuario.id,
                    data_finalizacao: new Date().toISOString()
                }])
                .select()
                .single();

            if (vendaError) throw vendaError;

            for (const item of carrinho) {
                await supabaseClient.from('saida_itens').insert([{
                    saida_id:      venda.id,
                    produto_id:    item.id,
                    quantidade:    item.quantidade,
                    valor_unitario: item.valor_venda,
                    subtotal:      item.subtotal,
                    ...(item.serial_id ? { serial_id: item.serial_id } : {})
                }]);

                const produto = produtos.find(p => p.id === item.id);
                const estAtual = produto?.estoque_total ?? produto?.estoque ?? 0;
                const novoEst  = estAtual - item.quantidade;

                await supabaseClient.from('produtos')
                    .update({ estoque_total: novoEst, ultima_movimentacao: new Date().toISOString() })
                    .eq('id', item.id);

                if (item.serial_id) {
                    await supabaseClient.from('produtos_seriais')
                        .update({ status: 'vendido', data_saida: new Date().toISOString() })
                        .eq('id', item.serial_id);
                }

                await supabaseClient.from('movimentos_estoque').insert([{
                    produto_id:          item.id,
                    tipo:                'saida',
                    quantidade:          item.quantidade,
                    quantidade_anterior: estAtual,
                    quantidade_nova:     novoEst,
                    motivo:              `Venda #${venda.id}`,
                    data:                new Date().toISOString(),
                    usuario_id:          usuario.id
                }]);
            }

            mostrarNotificacao(`✅ Venda #${venda.id} finalizada com sucesso!`, 'success');

            // Feedback de status na página
            const status = document.getElementById('statusVenda');
            if (status) {
                status.innerHTML = `✅ Venda <strong>#${venda.id}</strong> finalizada às 
                    <span style="color:var(--gray)">${new Date().toLocaleTimeString('pt-BR')}</span>`;
            }

            // Gerar comprovante e limpar
            await gerarComprovante(venda.id);
            limparFormulario();
            await carregarDados();

        } catch (error) {
            console.error('Erro ao finalizar venda:', error);
            mostrarNotificacao('Erro ao finalizar venda: ' + (error.message || 'Verifique os dados'), 'error');
        } finally {
            if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = '✅ Finalizar Venda'; }
        }
    }

    document.getElementById('btnFinalizarVenda')?.addEventListener('click', finalizarVenda);

    // =====================================================
    // CANCELAR VENDA
    // =====================================================

    window.cancelarVenda = async (vendaId) => {
        if (!verificarPermissaoModulo('saidas', 'cancelar')) {
            mostrarNotificacao('Você não tem permissão para cancelar vendas!', 'error');
            return;
        }

        try {
            const { data: venda } = await supabaseClient
                .from('saidas')
                .select('*, clientes(nome)')
                .eq('id', vendaId)
                .single();

            if (venda?.cancelado) {
                mostrarNotificacao('⚠️ Esta venda já foi cancelada!', 'error');
                return;
            }

            if (!podeCancelarVenda(venda?.data_finalizacao)) {
                mostrarNotificacao('⛔ Prazo de cancelamento (2h) expirado!', 'error');
                return;
            }

            const motivo = prompt(
                `⚠️ Cancelar Venda #${vendaId}\nCliente: ${venda?.clientes?.nome || '—'}\nTotal: ${formatarMoeda(venda?.total)}\n\nInforme o motivo:`
            );
            if (motivo === null) return;
            if (!motivo.trim()) { mostrarNotificacao('Informe o motivo!', 'error'); return; }

            if (!confirm(`Confirma o cancelamento da venda #${vendaId}?\n\nIsso irá estornar o estoque de todos os produtos.`)) return;

            const { data: itens } = await supabaseClient
                .from('saida_itens')
                .select('*, produtos(id, nome, estoque_total)')
                .eq('saida_id', vendaId);

            // Estornar estoque
            for (const item of (itens || [])) {
                const estAtual = item.produtos?.estoque_total || 0;
                const novoEst  = estAtual + item.quantidade;

                await supabaseClient.from('produtos')
                    .update({ estoque_total: novoEst, ultima_movimentacao: new Date().toISOString() })
                    .eq('id', item.produto_id);

                if (item.serial_id) {
                    await supabaseClient.from('produtos_seriais')
                        .update({ status: 'disponivel', data_saida: null })
                        .eq('id', item.serial_id);
                }

                await supabaseClient.from('movimentos_estoque').insert([{
                    produto_id:          item.produto_id,
                    tipo:                'entrada',
                    quantidade:          item.quantidade,
                    quantidade_anterior: estAtual,
                    quantidade_nova:     novoEst,
                    motivo:              `Cancelamento de venda #${vendaId} — ${motivo}`,
                    data:                new Date().toISOString(),
                    usuario_id:          usuario.id
                }]);
            }

            await supabaseClient.from('saidas').update({
                cancelado:           true,
                cancelado_em:        new Date().toISOString(),
                cancelado_por:       usuario.id,
                motivo_cancelamento: motivo
            }).eq('id', vendaId);

            mostrarNotificacao(`✅ Venda #${vendaId} cancelada! Estoque estornado.`, 'success');
            await carregarDados();

        } catch (error) {
            console.error('Erro ao cancelar venda:', error);
            mostrarNotificacao('Erro ao cancelar: ' + error.message, 'error');
        }
    };

    // =====================================================
    // COMPROVANTE
    // =====================================================

    window.verComprovante = async (vendaId) => { await gerarComprovante(vendaId); };

    async function gerarComprovante(vendaId) {
        try {
            const { data: venda } = await supabaseClient
                .from('saidas')
                .select('*, clientes(nome,telefone,email,endereco,numero,cidade,estado,cpf_cnpj), usuarios(nome)')
                .eq('id', vendaId)
                .single();

            const { data: itens } = await supabaseClient
                .from('saida_itens')
                .select('*, produtos(id,nome,codigo,categoria,marca,modelo)')
                .eq('saida_id', vendaId);

            for (const item of (itens || [])) {
                if (item.serial_id) {
                    const { data: s } = await supabaseClient
                        .from('produtos_seriais')
                        .select('numero_serie, imei')
                        .eq('id', item.serial_id)
                        .single();
                    if (s) { item.numero_serie = s.numero_serie; item.imei = s.imei; }
                }
            }

            const cliente  = venda?.clientes || {};
            const subtotal = (itens || []).reduce((s, i) => s + (i.subtotal || 0), 0);
            const desconto = venda?.desconto || 0;
            const total    = venda?.total    || 0;
            const cancelada = venda?.cancelado;
            const horaVenda = new Date().toLocaleTimeString('pt-BR');

            document.getElementById('comprovanteBody').innerHTML = `
                <div id="comprovante" style="padding:15px 5px;font-family:'Courier New',monospace;max-width:400px;margin:0 auto;font-size:14px;line-height:1.3;color:#000;box-sizing:border-box;">

                    <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:12px;">
                        <h2 style="margin:0;font-size:18px;font-weight:bold;">${configLoja.nome || 'Estoque Eletrônicos'}</h2>
                        ${configLoja.cnpj     ? `<p style="margin:2px 0;font-size:13px;">CNPJ: ${configLoja.cnpj}</p>` : ''}
                        ${configLoja.endereco ? `<p style="margin:2px 0;font-size:13px;">${configLoja.endereco}${configLoja.numero ? ', ' + configLoja.numero : ''}</p>` : ''}
                        ${configLoja.cidade   ? `<p style="margin:2px 0;font-size:13px;">${configLoja.cidade} - ${configLoja.estado || ''} | CEP: ${configLoja.cep || ''}</p>` : ''}
                        ${configLoja.telefone ? `<p style="margin:2px 0;font-size:13px;">Tel: ${configLoja.telefone}</p>` : ''}
                        ${configLoja.email    ? `<p style="margin:2px 0;font-size:13px;">Email: ${configLoja.email}</p>` : ''}
                    </div>

                    <div style="text-align:center;margin-bottom:12px;">
                        <h3 style="margin:0;font-size:15px;font-weight:bold;">${cancelada ? '⚠️ CANCELADO — ' : ''}COMPROVANTE DE VENDA</h3>
                        <p style="margin:4px 0;font-size:13px;"><strong>Nº ${venda.id}</strong> | ${formatarData(venda.data)} às ${horaVenda}</p>
                        ${cancelada ? `
                            <p style="color:#dc2626;margin-top:8px;font-size:13px;">
                                <strong>VENDA CANCELADA</strong><br>
                                Motivo: ${venda.motivo_cancelamento || 'Não informado'}<br>
                                Cancelado em: ${venda.cancelado_em ? new Date(venda.cancelado_em).toLocaleString('pt-BR') : '-'}
                            </p>` : ''}
                    </div>

                    <div style="margin-bottom:12px;font-size:13px;">
                        <div style="border-top:1px dashed #000;margin-bottom:8px;"></div>
                        <p style="margin:2px 0;"><strong>Vendedor:</strong> ${venda.usuarios?.nome || 'Sistema'}</p>
                        <div style="border-top:1px dashed #eee;margin:6px 0;"></div>
                        <h4 style="margin:0 0 6px;font-size:14px;font-weight:bold;">DADOS DO CLIENTE</h4>
                        <p style="margin:2px 0;"><strong>Nome:</strong> ${cliente.nome || 'Cliente não informado'}</p>
                        ${cliente.cpf_cnpj ? `<p style="margin:2px 0;"><strong>CPF/CNPJ:</strong> ${cliente.cpf_cnpj}</p>` : ''}
                        ${cliente.telefone ? `<p style="margin:2px 0;"><strong>Tel:</strong> ${cliente.telefone}</p>` : ''}
                        ${cliente.email    ? `<p style="margin:2px 0;"><strong>Email:</strong> ${cliente.email}</p>` : ''}
                        ${cliente.endereco ? `<p style="margin:2px 0;"><strong>End.:</strong> ${cliente.endereco}, ${cliente.numero || ''} — ${cliente.cidade || ''}/${cliente.estado || ''}</p>` : ''}
                    </div>

                    <div style="margin-bottom:12px;">
                        <div style="border-top:1px dashed #000;margin-bottom:8px;"></div>
                        <h4 style="margin:0 0 6px;font-size:14px;font-weight:bold;">ITENS VENDIDOS</h4>
                        <table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.2;">
                            <thead>
                                <tr style="border-bottom:1px dashed #000;">
                                    <th style="padding:4px 0;text-align:left;">Cod/Produto/Série</th>
                                    <th style="padding:4px 0;text-align:center;width:40px;">Qtd</th>
                                    <th style="padding:4px 0;text-align:right;width:90px;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(itens || []).map(item => `
                                    <tr style="border-bottom:1px dashed #eee;">
                                        <td style="padding:5px 0;vertical-align:top;">
                                            <span style="font-size:11px;color:#555;">${item.produtos?.codigo || item.produto_id}</span><br>
                                            <strong>${item.produtos?.nome || 'Produto'}</strong>
                                            ${item.numero_serie ? `<br><small style="color:#2563eb;">🔢 Série: <strong>${item.numero_serie}</strong></small>` : ''}
                                            ${item.imei ? `<br><small style="color:#6b7280;">📱 IMEI: ${item.imei}</small>` : ''}
                                        </td>
                                        <td style="padding:5px 0;vertical-align:top;text-align:center;">${item.quantidade}</td>
                                        <td style="padding:5px 0;vertical-align:top;text-align:right;">${formatarMoeda(item.subtotal)}</td>
                                    </tr>`).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="border-top:1px dashed #000;">
                                    <td colspan="2" style="padding:6px 0 2px;text-align:right;">Subtotal:</td>
                                    <td style="padding:6px 0 2px;text-align:right;">${formatarMoeda(subtotal)}</td>
                                </tr>
                                ${desconto > 0 ? `
                                <tr>
                                    <td colspan="2" style="padding:2px 0;text-align:right;">Desconto:</td>
                                    <td style="padding:2px 0;text-align:right;">-${formatarMoeda(desconto)}</td>
                                </tr>` : ''}
                                <tr style="font-size:15px;font-weight:bold;">
                                    <td colspan="2" style="padding:4px 0;text-align:right;border-top:1px dashed #000;">TOTAL:</td>
                                    <td style="padding:4px 0;text-align:right;border-top:1px dashed #000;">${formatarMoeda(total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div style="margin-bottom:12px;font-size:13px;">
                        <div style="border-top:1px dashed #000;margin-bottom:8px;"></div>
                        <p style="margin:2px 0;"><strong>Forma de Pagamento:</strong> ${venda.forma_pagamento || '-'}</p>
                        ${venda.observacao ? `<p style="margin:2px 0;"><strong>Observação:</strong> ${venda.observacao}</p>` : ''}
                    </div>

                    <div style="text-align:center;border-top:1px dashed #000;padding-top:10px;font-size:11px;line-height:1.2;">
                        <p style="margin:4px 0;">${configLoja.mensagem_garantia || 'Produto com garantia de 90 dias contra defeitos de fabricação.'}</p>
                        <p style="margin:4px 0;">Este documento é um comprovante de venda válido.</p>
                        <p style="margin:4px 0;font-weight:bold;">Obrigado pela preferência! 😊</p>
                    </div>
                </div>`;;

            document.getElementById('modalComprovante').style.display = 'flex';

        } catch (error) {
            console.error('Erro ao gerar comprovante:', error);
            mostrarNotificacao('Erro ao gerar comprovante: ' + error.message, 'error');
        }
    }

    // =====================================================
    // IMPRIMIR / PDF
    // =====================================================

    document.getElementById('btnImprimir')?.addEventListener('click', () => {
        const conteudo = document.getElementById('comprovante')?.innerHTML;
        if (!conteudo) return;
        const janela = window.open('', '_blank');
        janela.document.write(`
            <html><head><title>Comprovante de Venda</title>
            <style>
                @page { margin: 0; size: auto; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    margin: 0;
                    padding: 4mm;
                    width: 100%;
                    max-width: 72mm;
                    margin: 0 auto;
                    font-size: 14px;
                    line-height: 1.3;
                    box-sizing: border-box;
                    background: #fff;
                    color: #000;
                }
                @media print {
                    html, body {
                        width: 72mm;
                        margin: 0;
                        padding: 2mm 2mm 5mm 2mm;
                    }
                    button { display: none; }
                }
            </style>
            </head><body>${conteudo}
            <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body></html>`);
        janela.document.close();
    });

    document.getElementById('btnSalvarPDF')?.addEventListener('click', () => {
        const el = document.getElementById('comprovante');
        if (!el) return;
        const janela = window.open('', '_blank', 'width=900,height=700');
        janela.document.write(`
            <html><head><title>Comprovante de Venda</title>
            <style>
                @page { margin: 0; size: auto; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    margin: 0;
                    padding: 4mm;
                    width: 100%;
                    max-width: 72mm;
                    margin: 0 auto;
                    font-size: 14px;
                    line-height: 1.3;
                    box-sizing: border-box;
                    background: #fff;
                    color: #000;
                }
                @media print {
                    html, body {
                        width: 72mm;
                        margin: 0;
                        padding: 2mm 2mm 5mm 2mm;
                    }
                    .no-print { display: none; }
                }
                .no-print {
                    text-align: right;
                    margin-bottom: 12px;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 8px;
                }
                .btn-print-pdf {
                    background: #eb5e28;
                    color: #fff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .btn-close-pdf {
                    background: #888;
                    color: #fff;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin-left: 6px;
                    font-weight: bold;
                }
            </style>
            </head><body>
            <div class="no-print">
                <button class="btn-print-pdf" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                <button class="btn-close-pdf" onclick="window.close()">Fechar</button>
            </div>
            ${el.innerHTML}
            <script>window.onload=function(){setTimeout(()=>window.print(),300);};<\/script>
            </body></html>`);
        janela.document.close();
    });

    // =====================================================
    // FECHAR MODAIS
    // =====================================================

    document.querySelectorAll('.close-comprovante').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalComprovante').style.display = 'none';
        });
    });

    document.querySelectorAll('.close-serial').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalSerial').style.display = 'none';
            produtoSerialPendente = null;
        });
    });

    // =====================================================
    // CADASTRO RÁPIDO DE CLIENTE
    // =====================================================

    const modalNovoCliente = document.getElementById('modalNovoCliente');
    const btnAdicionarClienteRapido = document.getElementById('btnAdicionarClienteRapido');
    const btnCancelarNovoCliente = document.getElementById('btnCancelarNovoCliente');
    const btnSalvarNovoCliente = document.getElementById('btnSalvarNovoCliente');
    const closeNovoCliente = document.querySelector('.close-novo-cliente');

    btnAdicionarClienteRapido?.addEventListener('click', () => {
        // Limpar os campos do modal
        document.getElementById('novoClienteNome').value = '';
        document.getElementById('novoClienteTelefone').value = '';
        document.getElementById('novoClienteCpfCnpj').value = '';
        document.getElementById('novoClienteEmail').value = '';
        document.getElementById('novoClienteEndereco').value = '';
        
        modalNovoCliente.style.display = 'flex';
        document.getElementById('novoClienteNome').focus();
    });

    const fecharModalCliente = () => {
        modalNovoCliente.style.display = 'none';
    };

    btnCancelarNovoCliente?.addEventListener('click', fecharModalCliente);
    closeNovoCliente?.addEventListener('click', fecharModalCliente);

    btnSalvarNovoCliente?.addEventListener('click', async () => {
        const nome = document.getElementById('novoClienteNome').value.trim();
        const telefone = document.getElementById('novoClienteTelefone').value.trim();
        const cpf_cnpj = document.getElementById('novoClienteCpfCnpj').value.trim();
        const email = document.getElementById('novoClienteEmail').value.trim();
        const endereco = document.getElementById('novoClienteEndereco').value.trim();

        if (!nome || !telefone) {
            mostrarNotificacao('Por favor, preencha o Nome e o Telefone!', 'error');
            return;
        }

        btnSalvarNovoCliente.disabled = true;
        btnSalvarNovoCliente.textContent = 'Salvando...';

        try {
            const dados = {
                nome,
                telefone,
                cpf_cnpj: cpf_cnpj || null,
                email: email || null,
                endereco: endereco || null,
                data_cadastro: new Date().toISOString()
            };

            const { data, error } = await supabaseClient
                .from('clientes')
                .insert([dados])
                .select()
                .single();

            if (error) throw error;

            // Adicionar ao array local para busca
            clientes.push(data);

            // Selecionar no PDV
            selecionarCliente(data.id, data.nome, data.cpf_cnpj);

            mostrarNotificacao('Cliente cadastrado e selecionado com sucesso!', 'success');
            fecharModalCliente();
        } catch (error) {
            console.error('Erro ao cadastrar cliente:', error);
            mostrarNotificacao('Erro ao cadastrar cliente: ' + error.message, 'error');
        } finally {
            btnSalvarNovoCliente.disabled = false;
            btnSalvarNovoCliente.textContent = 'Salvar e Selecionar';
        }
    });

    window.onclick = (event) => {
        if (event.target === document.getElementById('modalComprovante'))
            document.getElementById('modalComprovante').style.display = 'none';
        if (event.target === document.getElementById('modalSerial')) {
            document.getElementById('modalSerial').style.display = 'none';
            produtoSerialPendente = null;
        }
        if (event.target === modalNovoCliente) {
            fecharModalCliente();
        }
    };

    // =====================================================
    // TOGGLE VENDAS RECENTES
    // =====================================================

    const toggleBtn  = document.getElementById('toggleVendasRecentes');
    const toggleBody = document.getElementById('vendasRecentesBody');
    const toggleIcon = document.getElementById('iconToggle');

    toggleBtn?.addEventListener('click', () => {
        const open = toggleBody.classList.toggle('open');
        if (toggleIcon) toggleIcon.classList.toggle('open', open);
        toggleBtn.classList.toggle('open', open);
    });

    // =====================================================
    // INICIALIZAR
    // =====================================================

    window.selecionarProduto   = selecionarProduto;
    window.selecionarSerial    = selecionarSerial;
    window.atualizarQuantidade = atualizarQuantidade;
    window.removerDoCarrinho   = removerDoCarrinho;
    window.verComprovante      = verComprovante;
    window.cancelarVenda       = cancelarVenda;

    carregarDados();
});