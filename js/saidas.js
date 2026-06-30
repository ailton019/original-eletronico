
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

        const itemExistente = carrinho.find(item =>
            item.id === produto.id &&
            (!serial || item.serial === serial?.numero_serie)
        );

        if (itemExistente) {
            if (itemExistente.quantidade + 1 > estoque) {
                mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoque}`, 'error');
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
                           style="width:60px;padding:5px;text-align:center;border:1px solid var(--border);border-radius:4px;">
                </div>
                <div><strong>${formatarMoeda(item.subtotal)}</strong></div>
                <button class="btn-remover" onclick="removerDoCarrinho(${index})">✕</button>
            </div>`).join('');
    }

    window.atualizarQuantidade = (index, quantidade) => {
        quantidade = parseInt(quantidade);
        if (isNaN(quantidade) || quantidade < 1) quantidade = 1;

        const produto = produtos.find(p => p.id === carrinho[index].id);
        const estoque = produto ? (produto.estoque_total ?? produto.estoque ?? 0) : 999;

        if (quantidade > estoque) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoque}`, 'error');
            quantidade = estoque;
        }

        carrinho[index].quantidade = quantidade;
        carrinho[index].subtotal   = quantidade * carrinho[index].valor_venda;
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
                .select('*, clientes(nome,telefone,email,endereco,numero,cidade,estado,cpf_cnpj)')
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
                <div id="comprovante" style="padding:20px;font-family:'Courier New',monospace;max-width:800px;margin:0 auto;font-size:12px;">

                    <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:15px;margin-bottom:20px;">
                        <h2 style="margin:0;font-size:18px;">${configLoja.nome || 'Estoque Eletrônicos'}</h2>
                        ${configLoja.cnpj     ? `<p style="margin:4px 0;">CNPJ: ${configLoja.cnpj}</p>` : ''}
                        ${configLoja.endereco ? `<p style="margin:4px 0;">${configLoja.endereco}${configLoja.numero ? ', ' + configLoja.numero : ''}</p>` : ''}
                        ${configLoja.cidade   ? `<p style="margin:4px 0;">${configLoja.cidade} - ${configLoja.estado || ''} | CEP: ${configLoja.cep || ''}</p>` : ''}
                        ${configLoja.telefone ? `<p style="margin:4px 0;">Tel: ${configLoja.telefone}</p>` : ''}
                        ${configLoja.email    ? `<p style="margin:4px 0;">Email: ${configLoja.email}</p>` : ''}
                    </div>

                    <div style="text-align:center;margin-bottom:20px;">
                        <h3 style="margin:0;">${cancelada ? '⚠️ CANCELADO — ' : ''}COMPROVANTE DE VENDA</h3>
                        <p style="margin:5px 0;"><strong>Nº ${venda.id}</strong> | ${formatarData(venda.data)} às ${horaVenda}</p>
                        ${cancelada ? `
                            <p style="color:#dc2626;margin-top:10px;">
                                <strong>VENDA CANCELADA</strong><br>
                                Motivo: ${venda.motivo_cancelamento || 'Não informado'}<br>
                                Cancelado em: ${venda.cancelado_em ? new Date(venda.cancelado_em).toLocaleString('pt-BR') : '-'}
                            </p>` : ''}
                    </div>

                    <div style="border:1px solid #ccc;padding:10px;margin-bottom:20px;">
                        <h4 style="margin:0 0 8px;">DADOS DO CLIENTE</h4>
                        <p style="margin:2px 0;"><strong>Nome:</strong> ${cliente.nome || 'Cliente não informado'}</p>
                        ${cliente.cpf_cnpj ? `<p style="margin:2px 0;"><strong>CPF/CNPJ:</strong> ${cliente.cpf_cnpj}</p>` : ''}
                        ${cliente.telefone ? `<p style="margin:2px 0;"><strong>Tel:</strong> ${cliente.telefone}</p>` : ''}
                        ${cliente.email    ? `<p style="margin:2px 0;"><strong>Email:</strong> ${cliente.email}</p>` : ''}
                        ${cliente.endereco ? `<p style="margin:2px 0;"><strong>End.:</strong> ${cliente.endereco}, ${cliente.numero || ''} — ${cliente.cidade || ''}/${cliente.estado || ''}</p>` : ''}
                    </div>

                    <div style="margin-bottom:20px;">
                        <h4 style="margin:0 0 8px;">ITENS VENDIDOS</h4>
                        <table style="width:100%;border-collapse:collapse;font-size:11px;">
                            <thead>
                                <tr style="background:#f0f0f0;border-bottom:1px solid #000;">
                                    <th style="padding:8px;text-align:left;">Código</th>
                                    <th style="padding:8px;text-align:left;">Produto / Série</th>
                                    <th style="padding:8px;text-align:center;">Qtd</th>
                                    <th style="padding:8px;text-align:right;">Unit.</th>
                                    <th style="padding:8px;text-align:right;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(itens || []).map(item => `
                                    <tr style="border-bottom:1px solid #ddd;">
                                        <td style="padding:8px;vertical-align:top;">${item.produtos?.codigo || item.produto_id}</td>
                                        <td style="padding:8px;vertical-align:top;">
                                            <strong>${item.produtos?.nome || 'Produto'}</strong>
                                            ${item.numero_serie ? `<br><small>🔢 Série: <strong>${item.numero_serie}</strong></small>` : ''}
                                            ${item.imei ? `<br><small>📱 IMEI: ${item.imei}</small>` : ''}
                                        </td>
                                        <td style="padding:8px;text-align:center;">${item.quantidade}</td>
                                        <td style="padding:8px;text-align:right;">${formatarMoeda(item.valor_unitario)}</td>
                                        <td style="padding:8px;text-align:right;">${formatarMoeda(item.subtotal)}</td>
                                    </tr>`).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="border-top:2px solid #000;">
                                    <td colspan="4" style="padding:8px;text-align:right;"><strong>Subtotal:</strong></td>
                                    <td style="padding:8px;text-align:right;"><strong>${formatarMoeda(subtotal)}</strong></td>
                                </tr>
                                ${desconto > 0 ? `
                                <tr>
                                    <td colspan="4" style="padding:8px;text-align:right;"><strong>Desconto:</strong></td>
                                    <td style="padding:8px;text-align:right;"><strong>- ${formatarMoeda(desconto)}</strong></td>
                                </tr>` : ''}
                                <tr style="background:#f0f0f0;font-size:14px;">
                                    <td colspan="4" style="padding:8px;text-align:right;"><strong>TOTAL:</strong></td>
                                    <td style="padding:8px;text-align:right;"><strong>${formatarMoeda(total)}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div style="border:1px solid #ccc;padding:10px;margin-bottom:20px;">
                        <p style="margin:2px 0;"><strong>Forma de Pagamento:</strong> ${venda.forma_pagamento || '-'}</p>
                        ${venda.observacao ? `<p style="margin:2px 0;"><strong>Observação:</strong> ${venda.observacao}</p>` : ''}
                    </div>

                    <div style="text-align:center;border-top:1px dashed #000;padding-top:15px;font-size:10px;">
                        <p>${configLoja.mensagem_garantia || 'Produto com garantia de 90 dias contra defeitos de fabricação.'}</p>
                        <p>Este documento é um comprovante de venda válido.</p>
                        <p>Obrigado pela preferência! 😊</p>
                    </div>
                </div>`;

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
            <style>body{font-family:monospace;margin:20px;} @media print{button{display:none;}}</style>
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
            <style>body{font-family:monospace;margin:20px;} @media print{button{display:none;}}</style>
            </head><body>
            <div style="text-align:right;margin-bottom:12px;" class="no-print">
                <button onclick="window.print()" style="background:#eb5e28;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
                <button onclick="window.close()" style="background:#888;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;margin-left:6px;">Fechar</button>
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

    window.onclick = (event) => {
        if (event.target === document.getElementById('modalComprovante'))
            document.getElementById('modalComprovante').style.display = 'none';
        if (event.target === document.getElementById('modalSerial')) {
            document.getElementById('modalSerial').style.display = 'none';
            produtoSerialPendente = null;
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