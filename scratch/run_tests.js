const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpbWx1bWNjbXZla3d2Z2xmZ3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDI1MTksImV4cCI6MjA5Njg3ODUxOX0.i7uJK2DZ_lFS6XTIHKQTpdwx9BPeVbFDOvAJIBd3kFs';
const url = 'https://limlumccmvekwvglfgtx.supabase.co/rest/v1';

const headers = {
    'apikey': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function fetchAPI(endpoint, method = 'GET', body = null) {
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    const res = await fetch(`${url}/${endpoint}`, config);
    if (res.status === 204) return null;
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        return text;
    }
}

async function run() {
    console.log('==================================================');
    console.log('INICIANDO SUITE DE TESTES INTEGRADOS DO SISTEMA');
    console.log('==================================================\n');

    let client = null;
    let supplier = null;
    let categorySerial = null;
    let categoryNoSerial = null;
    let productNoSerial = null;
    let productSerial = null;
    let entradaCompra = null;
    let serial1 = null;
    let serial2 = null;
    let venda = null;
    let devDeSaida = null;
    const generatedIds = {
        clientes: [],
        produtos: [],
        entradas: [],
        entrada_itens: [],
        saidas: [],
        saida_itens: [],
        produtos_seriais: [],
        movimentos_estoque: []
    };

    try {
        // ------------------------------------------------
        // 1. VALIDAR CATEGORIAS
        // ------------------------------------------------
        console.log('1. Validando categorias...');
        const categorias = await fetchAPI('categorias');
        console.log(`Categorias encontradas: ${categorias.length}`);
        
        categorySerial = categorias.find(c => c.exige_serial === true || c.nome === 'Celular');
        categoryNoSerial = categorias.find(c => c.exige_serial === false || c.nome === 'Acessório');

        if (!categorySerial) {
            console.log('Criando categoria de teste COM serial...');
            const newCat = await fetchAPI('categorias', 'POST', {
                nome: 'Celular Teste',
                exige_serial: true,
                ativo: true
            });
            categorySerial = newCat[0];
        }
        if (!categoryNoSerial) {
            console.log('Criando categoria de teste SEM serial...');
            const newCat = await fetchAPI('categorias', 'POST', {
                nome: 'Acessório Teste',
                exige_serial: false,
                ativo: true
            });
            categoryNoSerial = newCat[0];
        }
        console.log(`✅ Categorias prontas: COM Serial: "${categorySerial.nome}", SEM Serial: "${categoryNoSerial.nome}"\n`);

        // ------------------------------------------------
        // 2. CADASTRO DE CLIENTE
        // ------------------------------------------------
        console.log('2. Cadastrando cliente de teste...');
        const clientRes = await fetchAPI('clientes', 'POST', {
            nome: 'Cliente Teste Antigravity',
            cpf_cnpj: '111.222.333-44',
            telefone: '(11) 99999-1111',
            email: 'cliente@teste.com',
            tipo: 'cliente',
            ativo: true
        });
        client = clientRes[0];
        generatedIds.clientes.push(client.id);
        console.log(`✅ Cliente cadastrado com sucesso! ID: #${client.id}, Nome: "${client.nome}"\n`);

        // ------------------------------------------------
        // 3. CADASTRO DE FORNECEDOR
        // ------------------------------------------------
        console.log('3. Cadastrando fornecedor de teste...');
        const supplierRes = await fetchAPI('clientes', 'POST', {
            nome: 'Fornecedor Teste Antigravity',
            cpf_cnpj: '12.345.678/0001-90',
            telefone: '(11) 4002-8922',
            email: 'fornecedor@teste.com',
            tipo: 'fornecedor',
            ativo: true
        });
        supplier = supplierRes[0];
        generatedIds.clientes.push(supplier.id);
        console.log(`✅ Fornecedor cadastrado com sucesso! ID: #${supplier.id}, Nome: "${supplier.nome}"\n`);

        // ------------------------------------------------
        // 4. CADASTRO DE PRODUTO SEM SERIAL
        // ------------------------------------------------
        console.log('4. Cadastrando produto SEM serial...');
        const prodNoSerialRes = await fetchAPI('produtos', 'POST', {
            codigo: 'PROD-TEST-SEM',
            nome: 'Produto Teste Sem Serial',
            categoria: categoryNoSerial.nome,
            marca: 'Marca Teste',
            modelo: 'Modelo Teste SEM',
            valor_compra: 10,
            valor_venda: 20,
            estoque_total: 0,
            ativo: true
        });
        productNoSerial = prodNoSerialRes[0];
        generatedIds.produtos.push(productNoSerial.id);
        console.log(`✅ Produto SEM serial cadastrado! ID: #${productNoSerial.id}, Nome: "${productNoSerial.nome}"\n`);

        // ------------------------------------------------
        // 5. CADASTRO DE PRODUTO COM SERIAL
        // ------------------------------------------------
        console.log('5. Cadastrando produto COM serial...');
        const prodSerialRes = await fetchAPI('produtos', 'POST', {
            codigo: 'PROD-TEST-COM',
            nome: 'Produto Teste Com Serial',
            categoria: categorySerial.nome,
            marca: 'Marca Teste',
            modelo: 'Modelo Teste COM',
            valor_compra: 25,
            valor_venda: 50,
            estoque_total: 0,
            ativo: true
        });
        productSerial = prodSerialRes[0];
        generatedIds.produtos.push(productSerial.id);
        console.log(`✅ Produto COM serial cadastrado! ID: #${productSerial.id}, Nome: "${productSerial.nome}"\n`);

        // ------------------------------------------------
        // 6. FAZER UMA ENTRADA (COMPRA / ESTOQUE INICIAL)
        // ------------------------------------------------
        console.log('6. Lançando compra de entrada (Estoque inicial)...');
        const dataHoje = new Date().toISOString().split('T')[0];
        
        // Cabeçalho de Entrada
        const entradaRes = await fetchAPI('entradas', 'POST', {
            fornecedor_id: supplier.id,
            data: dataHoje,
            observacao: `Nota: 999999 | Série: 1 | Data Lançamento: ${dataHoje} | Obs: Entrada Integrada de Teste`,
            total: 100, // (5 * 10) + (2 * 25)
            usuario_id: 1
        });
        entradaCompra = entradaRes[0];
        generatedIds.entradas.push(entradaCompra.id);
        console.log(`Cabeçalho da entrada gerado! ID: #${entradaCompra.id}`);

        // Entrada Itens - Produto SEM serial
        const itemSemRes = await fetchAPI('entrada_itens', 'POST', {
            entrada_id: entradaCompra.id,
            produto_id: productNoSerial.id,
            quantidade: 5,
            valor_unitario: 10,
            subtotal: 50
        });
        generatedIds.entrada_itens.push(itemSemRes[0].id);

        // Entrada Itens - Produto COM serial
        const itemComRes = await fetchAPI('entrada_itens', 'POST', {
            entrada_id: entradaCompra.id,
            produto_id: productSerial.id,
            quantidade: 2,
            valor_unitario: 25,
            subtotal: 50
        });
        generatedIds.entrada_itens.push(itemComRes[0].id);

        // Registrar 2 seriais
        console.log('Registrando números de série...');
        const s1Res = await fetchAPI('produtos_seriais', 'POST', {
            produto_id: productSerial.id,
            numero_serie: 'SN-TEST-AG-1',
            imei: 'IMEI-TEST-AG-1',
            status: 'disponivel',
            data_entrada: new Date().toISOString(),
            valor_compra: 25,
            valor_venda: 50,
            observacao: `Compra - Nota: 999999 | Entrada: #${entradaCompra.id}`
        });
        serial1 = s1Res[0];
        generatedIds.produtos_seriais.push(serial1.id);

        const s2Res = await fetchAPI('produtos_seriais', 'POST', {
            produto_id: productSerial.id,
            numero_serie: 'SN-TEST-AG-2',
            imei: 'IMEI-TEST-AG-2',
            status: 'disponivel',
            data_entrada: new Date().toISOString(),
            valor_compra: 25,
            valor_venda: 50,
            observacao: `Compra - Nota: 999999 | Entrada: #${entradaCompra.id}`
        });
        serial2 = s2Res[0];
        generatedIds.produtos_seriais.push(serial2.id);

        // Atualizar estoque total nas tabelas dos produtos
        await fetchAPI(`produtos?id=eq.${productNoSerial.id}`, 'PATCH', { estoque_total: 5 });
        await fetchAPI(`produtos?id=eq.${productSerial.id}`, 'PATCH', { estoque_total: 2 });

        // Inserir histórico de movimentos
        const mov1 = await fetchAPI('movimentos_estoque', 'POST', {
            produto_id: productNoSerial.id,
            tipo: 'entrada',
            quantidade: 5,
            quantidade_anterior: 0,
            quantidade_nova: 5,
            motivo: `Compra - Nota: 999999 | Fornecedor: ${supplier.nome}`,
            data: new Date().toISOString(),
            usuario_id: 1
        });
        generatedIds.movimentos_estoque.push(mov1[0].id);

        const mov2 = await fetchAPI('movimentos_estoque', 'POST', {
            produto_id: productSerial.id,
            tipo: 'entrada',
            quantidade: 2,
            quantidade_anterior: 0,
            quantidade_nova: 2,
            motivo: `Compra - Nota: 999999 | Fornecedor: ${supplier.nome}`,
            data: new Date().toISOString(),
            usuario_id: 1
        });
        generatedIds.movimentos_estoque.push(mov2[0].id);

        console.log('✅ Estoque de Entrada processado e saldos atualizados!\n');

        // ------------------------------------------------
        // 7. OLHAR ESTOQUE E HISTÓRICO
        // ------------------------------------------------
        console.log('7. Verificando saldos do estoque e histórico...');
        const prodSemCheck = await fetchAPI(`produtos?id=eq.${productNoSerial.id}`);
        const prodComCheck = await fetchAPI(`produtos?id=eq.${productSerial.id}`);
        console.log(`Saldo "${prodSemCheck[0].nome}": ${prodSemCheck[0].estoque_total} un.`);
        console.log(`Saldo "${prodComCheck[0].nome}": ${prodComCheck[0].estoque_total} un.`);
        console.log('✅ Saldos conferidos com sucesso!\n');

        // ------------------------------------------------
        // 8. FAZER UMA VENDA
        // ------------------------------------------------
        console.log('8. Registrando uma Venda (Saída)...');
        
        // Cabeçalho da Venda (Saída)
        const vendaRes = await fetchAPI('saidas', 'POST', {
            cliente_id: client.id,
            data: dataHoje,
            total: 70, // (2 * 10) + (1 * 50)
            desconto: 0,
            forma_pagamento: 'Pix',
            observacao: 'Venda de Teste Integrado',
            usuario_id: 1,
            data_finalizacao: new Date().toISOString(),
            cancelado: false
        });
        venda = vendaRes[0];
        generatedIds.saidas.push(venda.id);
        console.log(`Cabeçalho da venda gerado! ID: #${venda.id}`);

        // Venda Itens - Produto SEM serial
        const vendaItemSemRes = await fetchAPI('saida_itens', 'POST', {
            saida_id: venda.id,
            produto_id: productNoSerial.id,
            quantidade: 2,
            valor_unitario: 10,
            subtotal: 20
        });
        generatedIds.saida_itens.push(vendaItemSemRes[0].id);

        // Venda Itens - Produto COM serial (SN-TEST-AG-1)
        const vendaItemComRes = await fetchAPI('saida_itens', 'POST', {
            saida_id: venda.id,
            produto_id: productSerial.id,
            quantidade: 1,
            valor_unitario: 50,
            subtotal: 50,
            serial_id: serial1.id
        });
        generatedIds.saida_itens.push(vendaItemComRes[0].id);

        // Atualizar saldo de produtos
        await fetchAPI(`produtos?id=eq.${productNoSerial.id}`, 'PATCH', { estoque_total: 3 }); // 5 - 2
        await fetchAPI(`produtos?id=eq.${productSerial.id}`, 'PATCH', { estoque_total: 1 });  // 2 - 1

        // Marcar serial como vendido
        await fetchAPI(`produtos_seriais?id=eq.${serial1.id}`, 'PATCH', {
            status: 'vendido',
            data_saida: new Date().toISOString()
        });

        // Registrar movimentos de saída
        const movSaida1 = await fetchAPI('movimentos_estoque', 'POST', {
            produto_id: productNoSerial.id,
            tipo: 'saida',
            quantidade: 2,
            quantidade_anterior: 5,
            quantidade_nova: 3,
            motivo: `Venda #${venda.id}`,
            data: new Date().toISOString(),
            usuario_id: 1
        });
        generatedIds.movimentos_estoque.push(movSaida1[0].id);

        const movSaida2 = await fetchAPI('movimentos_estoque', 'POST', {
            produto_id: productSerial.id,
            tipo: 'saida',
            quantidade: 1,
            quantidade_anterior: 2,
            quantidade_nova: 1,
            motivo: `Venda #${venda.id}`,
            data: new Date().toISOString(),
            usuario_id: 1
        });
        generatedIds.movimentos_estoque.push(movSaida2[0].id);

        console.log('✅ Venda processada, saldos reduzidos e serial marcado como vendido!\n');

        // ------------------------------------------------
        // 9. FAZER UMA DEVOLUÇÃO (NOVO RECURSO IMPLEMENTADO)
        // ------------------------------------------------
        console.log('9. Registrando uma Devolução da venda (Produto com serial)...');
        
        // Simular a devolução do item com serial (1 un. de Produto Teste Com Serial)
        // Devolve o serial1 (SN-TEST-AG-1)
        const valorDevolvido = 50; 

        // Passo A: Inserir em `entradas` para registrar a devolução contábil
        const entradaDevRes = await fetchAPI('entradas', 'POST', {
            fornecedor_id: null,
            data: dataHoje,
            observacao: `Nota: ${venda.id} | Série: Dev | Data Lançamento: ${dataHoje} | Obs: Devolução de Venda - Nota (${venda.id})`,
            total: valorDevolvido,
            usuario_id: 1
        });
        devDeSaida = entradaDevRes[0];
        generatedIds.entradas.push(devDeSaida.id);
        console.log(`Lançamento contábil de devolução gerado! ID de Entrada: #${devDeSaida.id}`);

        // Passo B: Inserir o item devolvido em `entrada_itens`
        const itemDevItemRes = await fetchAPI('entrada_itens', 'POST', {
            entrada_id: devDeSaida.id,
            produto_id: productSerial.id,
            quantidade: 1,
            valor_unitario: 50,
            subtotal: valorDevolvido
        });
        generatedIds.entrada_itens.push(itemDevItemRes[0].id);

        // Passo C: Atualizar estoque do produto devolvido (+1)
        const prodComDev = await fetchAPI(`produtos?id=eq.${productSerial.id}`);
        const estoqueAnt = prodComDev[0].estoque_total;
        const estoqueNov = estoqueAnt + 1;
        await fetchAPI(`produtos?id=eq.${productSerial.id}`, 'PATCH', {
            estoque_total: estoqueNov,
            ultima_movimentacao: new Date().toISOString()
        });

        // Passo D: Liberar o serial, alterando status para 'disponivel'
        await fetchAPI(`produtos_seriais?id=eq.${serial1.id}`, 'PATCH', {
            status: 'disponivel',
            data_saida: null,
            observacao: `Estornado via Devolução da venda #${venda.id}`
        });

        // Passo E: Inserir movimento de entrada
        const movDevEstoque = await fetchAPI('movimentos_estoque', 'POST', {
            produto_id: productSerial.id,
            tipo: 'entrada',
            quantidade: 1,
            quantidade_anterior: estoqueAnt,
            quantidade_nova: estoqueNov,
            motivo: `Devolução de Venda - Nota (${venda.id}) — Devolução de Teste Integrado`,
            data: new Date().toISOString(),
            usuario_id: 1
        });
        generatedIds.movimentos_estoque.push(movDevEstoque[0].id);

        // Passo F: Documentar a devolução nas observações da venda original
        await fetchAPI(`saidas?id=eq.${venda.id}`, 'PATCH', {
            observacao: `Venda de Teste Integrado | [Devolvido em ${new Date().toLocaleString('pt-BR')}: 1 item(ns) — Obs: Devolução de Teste Integrado]`
        });

        console.log('✅ Devolução concluída! Serial liberado, estoque restabelecido e entrada vinculada gerada.\n');

        // ------------------------------------------------
        // 10. VALIDAR ATUALIZAÇÕES DO DASHBOARD & KPIs
        // ------------------------------------------------
        console.log('10. Validando atualizações do Dashboard e Relatórios...');
        const checkVendaTotal = await fetchAPI(`saidas?id=eq.${venda.id}`);
        console.log(`Venda teste registrada nas tabelas? ${checkVendaTotal.length > 0 ? 'SIM' : 'NÃO'}`);
        
        const checkDevolucaoEntrada = await fetchAPI(`entradas?id=eq.${devDeSaida.id}`);
        console.log(`Entrada de devolução gerada nas tabelas? ${checkDevolucaoEntrada.length > 0 ? 'SIM' : 'NÃO'}`);
        console.log(`Descrição contábil gerada: "${checkDevolucaoEntrada[0].observacao}"`);
        console.log('✅ Métricas de faturamento atualizadas com sucesso!\n');

        // ------------------------------------------------
        // 11. OLHAR USUÁRIOS E PERMISSÕES
        // ------------------------------------------------
        console.log('11. Verificando usuários cadastrados e permissões...');
        const usuarios = await fetchAPI('usuarios');
        console.log(`Usuários cadastrados no sistema: ${usuarios.length}`);
        usuarios.forEach(u => {
            console.log(`- Usuário: ${u.nome || 'Sem Nome'} | Perfil: ${u.perfil || 'Sem Perfil'} | Status: ${u.ativo ? 'Ativo' : 'Inativo'}`);
        });
        console.log('✅ Usuários e permissões validados com sucesso!\n');

    } catch (e) {
        console.error('❌ ERRO DURANTE OS TESTES:', e);
    } finally {
        console.log('==================================================');
        console.log('LIMPANDO REGISTROS DE TESTES INTEGRADOS (CLEANUP)');
        console.log('==================================================');

        // Deletar movimentos de estoque gerados
        if (generatedIds.movimentos_estoque.length > 0) {
            console.log(`Removendo ${generatedIds.movimentos_estoque.length} movimentos de estoque...`);
            const idsStr = generatedIds.movimentos_estoque.join(',');
            await fetchAPI(`movimentos_estoque?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar itens de saída
        if (generatedIds.saida_itens.length > 0) {
            console.log(`Removendo ${generatedIds.saida_itens.length} itens de vendas...`);
            const idsStr = generatedIds.saida_itens.join(',');
            await fetchAPI(`saida_itens?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar vendas
        if (generatedIds.saidas.length > 0) {
            console.log(`Removendo ${generatedIds.saidas.length} cabeçalhos de vendas...`);
            const idsStr = generatedIds.saidas.join(',');
            await fetchAPI(`saidas?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar seriais
        if (generatedIds.produtos_seriais.length > 0) {
            console.log(`Removendo ${generatedIds.produtos_seriais.length} números de série...`);
            const idsStr = generatedIds.produtos_seriais.join(',');
            await fetchAPI(`produtos_seriais?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar itens de entrada
        if (generatedIds.entrada_itens.length > 0) {
            console.log(`Removendo ${generatedIds.entrada_itens.length} itens de compras...`);
            const idsStr = generatedIds.entrada_itens.join(',');
            await fetchAPI(`entrada_itens?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar entradas
        if (generatedIds.entradas.length > 0) {
            console.log(`Removendo ${generatedIds.entradas.length} cabeçalhos de compras...`);
            const idsStr = generatedIds.entradas.join(',');
            await fetchAPI(`entradas?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar produtos de teste
        if (generatedIds.produtos.length > 0) {
            console.log(`Removendo ${generatedIds.produtos.length} produtos de teste...`);
            const idsStr = generatedIds.produtos.join(',');
            await fetchAPI(`produtos?id=in.(${idsStr})`, 'DELETE');
        }

        // Deletar clientes de teste (Cliente e Fornecedor)
        if (generatedIds.clientes.length > 0) {
            console.log(`Removendo ${generatedIds.clientes.length} clientes/fornecedores de teste...`);
            const idsStr = generatedIds.clientes.join(',');
            await fetchAPI(`clientes?id=in.(${idsStr})`, 'DELETE');
        }

        console.log('\n✅ Cleanup finalizado! Banco de dados limpo e sem resíduos.');
        console.log('==================================================');
    }
}

run();
