// js/configuracao.js
// Lógica para carregar e salvar as configurações da empresa/loja no Supabase

let configId = 1; // Padrão ID 1

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar se o usuário está logado e tem perfil admin ou gerente
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    if (usuario.perfil !== 'admin' && usuario.perfil !== 'gerente') {
        mostrarNotificacao('Acesso negado! Apenas administradores e gerentes podem acessar esta página.', 'error');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        return;
    }

    // Carregar configurações do banco
    await carregarConfiguracoes();
});

// Função para buscar os dados de configuração
async function carregarConfiguracoes() {
    try {
        const { data, error } = await supabaseClient
            .from('config_loja')
            .select('*')
            .limit(1);

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            const config = data[0];
            configId = config.id;

            // Preencher inputs
            document.getElementById('nomeEmpresa').value = config.nome || '';
            document.getElementById('razaoSocial').value = config.razao_social || '';
            document.getElementById('cnpj').value = config.cnpj || '';
            document.getElementById('telefone').value = config.telefone || '';
            document.getElementById('rua').value = config.endereco || '';
            document.getElementById('numero').value = config.numero || '';
            document.getElementById('cidade').value = config.cidade || '';
            document.getElementById('estado').value = config.estado || '';
            document.getElementById('email').value = config.email || '';
            document.getElementById('cep').value = config.cep || '';
            document.getElementById('mensagemGarantia').value = config.mensagem_garantia || '';
        } else {
            console.log('Nenhuma configuração encontrada, iniciando com dados limpos.');
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        mostrarNotificacao('Erro ao carregar configurações: ' + error.message, 'error');
    }
}

// Função para salvar ou atualizar as configurações
async function salvarConfiguracoes(event) {
    event.preventDefault();

    const btnSalvar = document.getElementById('btnSalvar');
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';

    const nome = document.getElementById('nomeEmpresa').value.trim();
    const razao_social = document.getElementById('razaoSocial').value.trim();
    const cnpj = document.getElementById('cnpj').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const endereco = document.getElementById('rua').value.trim();
    const numero = document.getElementById('numero').value.trim();
    const cidade = document.getElementById('cidade').value.trim();
    const estado = document.getElementById('estado').value;
    const email = document.getElementById('email').value.trim();
    const cep = document.getElementById('cep').value.trim();
    const mensagem_garantia = document.getElementById('mensagemGarantia').value.trim();

    const configData = {
        nome,
        razao_social: razao_social || null,
        cnpj: cnpj || null,
        telefone,
        endereco: endereco || null,
        numero: numero || null,
        cidade: cidade || null,
        estado: estado || null,
        email: email || null,
        cep: cep || null,
        mensagem_garantia: mensagem_garantia || null,
        updated_at: new Date().toISOString()
    };

    try {
        // Upsert garantindo que mantenha o ID 1
        const { error } = await supabaseClient
            .from('config_loja')
            .upsert({ id: configId, ...configData });

        if (error) {
            throw error;
        }

        mostrarNotificacao('Configurações salvas com sucesso!', 'success');
        
        // Atualizar config no sessionStorage se as outras telas usarem para algum display instantâneo
        sessionStorage.setItem('configLoja', JSON.stringify(configData));

    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        mostrarNotificacao('Erro ao salvar configurações: ' + error.message, 'error');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar Alterações';
    }
}
