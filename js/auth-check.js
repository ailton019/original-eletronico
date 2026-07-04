// js/auth-check.js
// Verificação de autenticação e filtro de menu

document.addEventListener('DOMContentLoaded', () => {
    // Verificar se a página atual é index.html (login)
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'index.html' || currentPage === '') {
        return;
    }
    
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    
    if (!usuario) {
        console.log('Usuário não logado, redirecionando para login...');
        window.location.href = 'index.html';
        return;
    }
    
    // === FILTRAR MENU POR PERMISSÃO ===
    filtrarMenuPorPermissao(usuario);
    
    // Mostrar informações do usuário - COM VERIFICAÇÃO DE ELEMENTOS
    const userNameElement = document.getElementById('userName');
    const userPerfilElement = document.getElementById('userPerfil');
    
    if (userNameElement) {
        userNameElement.textContent = usuario.nome || 'Usuário';
    }
    if (userPerfilElement) {
        const perfilLabels = {
            admin: '👑 Administrador',
            gerente: '📊 Gerente',
            vendedor: '💰 Vendedor',
            tecnico: '🔧 Técnico',
            basico: '👤 Básico'
        };
        userPerfilElement.textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    }
    
    // === LOGOUT - COM PREVENÇÃO DE LOOP ===
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        // Remover eventos anteriores clonando
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        
        newLogoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm('Tem certeza que deseja sair do sistema?')) {
                sessionStorage.clear();
                window.location.replace('index.html');
            }
        });
    }
    
    // === MENU TOGGLE (mobile) ===
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        // Remover eventos anteriores
        const newMenuToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newMenuToggle, menuToggle);
        
        newMenuToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });
    }
});

// =====================================================
// FUNÇÃO PARA FILTRAR MENU POR PERMISSÃO
// =====================================================

function filtrarMenuPorPermissao(usuario) {
    // Mapeamento de links para módulos
    const linksMap = {
        'dashboard.html': 'dashboard',
        'clientes.html': 'clientes',
        'produtos.html': 'produtos',
        'categorias.html': 'categorias',
        'estoque.html': 'estoque',
        'entradas.html': 'entradas',
        'saidas.html': 'saidas',
        'devolucoes.html': 'saidas',
        'fornecedores.html': 'fornecedores',
        'ordem-servico.html': 'ordens_servico',
        'relatorios.html': 'relatorios',
        'usuarios.html': 'usuarios'
    };
    
    const links = document.querySelectorAll('.sidebar-nav a');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        const modulo = linksMap[href];
        
        if (modulo) {
            const podeVer = verificarPermissaoUsuario(usuario, modulo, 'ver');
            
            if (!podeVer) {
                link.style.display = 'none';
                link.parentElement.style.display = 'none';
            } else {
                link.style.display = 'flex';
                link.parentElement.style.display = 'block';
            }
        }
    });
}

// =====================================================
// FUNÇÃO PARA VERIFICAR PERMISSÃO DO USUÁRIO
// =====================================================

function verificarPermissaoUsuario(usuario, modulo, acao = 'ver') {
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

// =====================================================
// FUNÇÃO GLOBAL PARA VERIFICAR PERMISSÃO
// =====================================================

function verificarPermissao(modulo, acao = 'ver') {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    return verificarPermissaoUsuario(usuario, modulo, acao);
}