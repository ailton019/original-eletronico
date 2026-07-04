// js/config.js
// Configuração do Supabase

// ⚠️ CREDENCIAIS: Use variáveis de ambiente em produção!
// Para desenvolvimento local, certifique-se de que .env não está versionado
const SUPABASE_URL = window.ENV?.SUPABASE_URL || 'https://limlumccmvekwvglfgtx.supabase.co';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpbWx1bWNjbXZla3d2Z2xmZ3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDI1MTksImV4cCI6MjA5Njg3ODUxOX0.i7uJK2DZ_lFS6XTIHKQTpdwx9BPeVbFDOvAJIBd3kFs';

if (!SUPABASE_ANON_KEY) {
    console.warn('⚠️ AVISO DE SEGURANÇA: SUPABASE_ANON_KEY não configurada!');
}

// Criar cliente Supabase
if (typeof supabaseClient === 'undefined') {
    var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Função para mostrar notificações
function mostrarNotificacao(mensagem, tipo = 'info') {
    // Remover notificações existentes
    const notificacaoExistente = document.querySelector('.notificacao');
    if (notificacaoExistente) {
        notificacaoExistente.remove();
    }
    
    const notificacao = document.createElement('div');
    notificacao.className = `notificacao notificacao-${tipo}`;
    notificacao.innerHTML = `
        <span>${mensagem}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(notificacao);
    
    setTimeout(() => {
        if (notificacao && notificacao.parentElement) {
            notificacao.remove();
        }
    }, 3000);
}

// Função global de logout - PREVENÇÃO DE LOOP
function fazerLogout() {
    if (confirm('Tem certeza que deseja sair do sistema?')) {
        // Limpar completamente a sessão
        sessionStorage.clear();
        // Usar window.location.replace para não manter histórico
        window.location.replace('index.html');
    }
}

// Adicionar estilos de notificação se não existirem
if (!document.querySelector('#notificacao-styles')) {
    const styleNotificacao = document.createElement('style');
    styleNotificacao.id = 'notificacao-styles';
    styleNotificacao.textContent = `
        .notificacao {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInNotificacao 0.3s ease;
        }
        .notificacao-success { background: #28a745; }
        .notificacao-error { background: #dc3545; }
        .notificacao-info { background: #17a2b8; }
        .notificacao-warning { background: #ffc107; color: #333; }
        .notificacao button {
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            padding: 0 5px;
        }
        @keyframes slideInNotificacao {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(styleNotificacao);
}

// Função para verificar se o usuário está logado
function isLogado() {
    return sessionStorage.getItem('usuario') !== null;
}

// Função para obter o usuário logado
function getUsuarioLogado() {
    const usuario = sessionStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
}
// js/config.js - ADICIONAR NO FINAL DO ARQUIVO

// =====================================================
// FUNÇÕES DE PERMISSÃO (ADICIONAR NO FINAL DO config.js)
// =====================================================

/**
 * Verifica se o usuário logado tem permissão para um módulo/ação
 * @param {string} modulo - Nome do módulo (ex: 'clientes', 'produtos')
 * @param {string} acao - Ação (ex: 'ver', 'criar', 'editar', 'excluir')
 * @returns {boolean}
 */
function temPermissao(modulo, acao = 'ver') {
    const usuario = getUsuarioLogado();
    if (!usuario) return false;
    
    // Admin tem acesso total
    if (usuario.perfil === 'admin') return true;
    
    // Verificar permissões do usuário
    const permissoes = usuario.permissoes || {};
    
    // Se não tiver permissões definidas, usar fallback por perfil
    if (Object.keys(permissoes).length === 0) {
        const permissoesFallback = {
            gerente: {
                dashboard: { ver: true },
                clientes: { ver: true, criar: true, editar: true, excluir: false },
                produtos: { ver: true, criar: true, editar: true, excluir: false },
                categorias: { ver: true, criar: false, editar: false, excluir: false },
                estoque: { ver: true, ajustar: false },
                entradas: { ver: true, criar: true, excluir: false },
                saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
                fornecedores: { ver: true, criar: true, editar: true, excluir: false },
                ordens_servico: { ver: true, criar: true, editar: true, excluir: false },
                relatorios: { ver: true, exportar: true },
                usuarios: { ver: false, criar: false, editar: false, excluir: false }
            },
            vendedor: {
                dashboard: { ver: true },
                clientes: { ver: true, criar: true, editar: true, excluir: false },
                produtos: { ver: true, criar: false, editar: false, excluir: false },
                categorias: { ver: false },
                estoque: { ver: true, ajustar: false },
                entradas: { ver: false },
                saidas: { ver: true, criar: true, cancelar: false, ver_vendas_outros: false },
                fornecedores: { ver: false },
                ordens_servico: { ver: false },
                relatorios: { ver: false },
                usuarios: { ver: false }
            },
            tecnico: {
                dashboard: { ver: true },
                clientes: { ver: true, criar: true, editar: true, excluir: false },
                produtos: { ver: true, criar: false, editar: false, excluir: false },
                categorias: { ver: false },
                estoque: { ver: false },
                entradas: { ver: false },
                saidas: { ver: false, criar: false, cancelar: false, ver_vendas_outros: false },
                fornecedores: { ver: false },
                ordens_servico: { ver: true, criar: true, editar: true, excluir: false },
                relatorios: { ver: false },
                usuarios: { ver: false }
            },
            basico: {
                dashboard: { ver: false },
                clientes: { ver: true, criar: false, editar: false, excluir: false },
                produtos: { ver: true, criar: false, editar: false, excluir: false },
                categorias: { ver: false },
                estoque: { ver: false },
                entradas: { ver: false },
                saidas: { ver: false, criar: false, cancelar: false, ver_vendas_outros: false },
                fornecedores: { ver: false },
                ordens_servico: { ver: false },
                relatorios: { ver: false },
                usuarios: { ver: false }
            }
        };
        
        const perfilPermissoes = permissoesFallback[usuario.perfil] || permissoesFallback.basico;
        return perfilPermissoes[modulo]?.[acao] || false;
    }
    
    return permissoes[modulo]?.[acao] || false;
}

/**
 * Verifica se o usuário tem permissão e redireciona se não tiver
 * @param {string} modulo - Nome do módulo
 * @param {string} acao - Ação (padrão: 'ver')
 * @param {string} redirectTo - Página para redirecionar (padrão: 'dashboard.html')
 * @returns {boolean}
 */
function verificarEAcessar(modulo, acao = 'ver', redirectTo = 'dashboard.html') {
    if (!temPermissao(modulo, acao)) {
        mostrarNotificacao('Acesso negado! Você não tem permissão.', 'error');
        setTimeout(() => {
            window.location.href = redirectTo;
        }, 1000);
        return false;
    }
    return true;
}

// Exportar funções
window.temPermissao = temPermissao;
window.verificarEAcessar = verificarEAcessar;

// =====================================================
// FUNÇÕES DE VALIDAÇÃO - SERIAL/IMEI
// =====================================================

/**
 * Validar se Serial/IMEI já existe no banco
 * @param {string} serial - Serial ou IMEI para validar
 * @param {number} produtoId - ID do produto (opcional)
 * @returns {Promise<boolean>} true se já existe, false se está disponível
 */
async function serialJaExiste(serial, produtoId = null) {
    if (!serial || serial.trim() === '') {
        return false; // Serial vazio é considerado válido
    }
    
    try {
        let query = supabaseClient
            .from('produtos_serial')
            .select('id')
            .eq('serial', serial.trim())
            .eq('disponivel', false); // Procurar apenas os que estão EM USO
        
        if (produtoId) {
            query = query.eq('produto_id', produtoId);
        }
        
        const { data, error } = await query.limit(1);
        
        if (error) {
            console.error('Erro ao validar serial:', error);
            return false;
        }
        
        return data && data.length > 0;
    } catch (error) {
        console.error('Erro ao validar serial:', error);
        return false;
    }
}

/**
 * Registrar novo Serial/IMEI no banco
 * @param {object} dados - { produto_id, serial, data_entrada }
 * @returns {Promise<boolean>} true se sucesso, false se falhou
 */
async function registrarSerial(dados) {
    try {
        // Validar se já existe
        const existe = await serialJaExiste(dados.serial, dados.produto_id);
        if (existe) {
            mostrarNotificacao('❌ Este Serial/IMEI já está em uso!', 'error');
            return false;
        }
        
        const { error } = await supabaseClient
            .from('produtos_serial')
            .insert([{
                produto_id: dados.produto_id,
                serial: dados.serial.trim(),
                disponivel: true,
                data_entrada: dados.data_entrada || new Date().toISOString()
            }]);
        
        if (error) {
            console.error('Erro ao registrar serial:', error);
            mostrarNotificacao('❌ Erro ao registrar Serial/IMEI', 'error');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Erro ao registrar serial:', error);
        mostrarNotificacao('❌ Erro ao registrar Serial/IMEI', 'error');
        return false;
    }
}

/**
 * Marcar Serial como usado (em uma venda)
 * @param {string} serial - Serial para marcar como usado
 * @returns {Promise<boolean>} true se sucesso
 */
async function marcarSerialComoUsado(serial) {
    try {
        const { error } = await supabaseClient
            .from('produtos_serial')
            .update({ disponivel: false })
            .eq('serial', serial.trim());
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao marcar serial como usado:', error);
        return false;
    }
}

/**
 * Reativar Serial (ao cancelar uma venda)
 * @param {string} serial - Serial para reativar
 * @returns {Promise<boolean>} true se sucesso
 */
async function reativarSerial(serial) {
    try {
        const { error } = await supabaseClient
            .from('produtos_serial')
            .update({ disponivel: true })
            .eq('serial', serial.trim());
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao reativar serial:', error);
        return false;
    }
}

// Exportar funções de serial
window.serialJaExiste = serialJaExiste;
window.registrarSerial = registrarSerial;
window.marcarSerialComoUsado = marcarSerialComoUsado;
window.reativarSerial = reativarSerial;