// js/active-nav.js
// Destacar o link do menu ativo baseado na página atual

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'dashboard.html')) {
            link.classList.add('active');
        }
    });
});

// Remover classe que impede transições no carregamento inicial
window.addEventListener('load', () => {
    document.body.classList.remove('hold-transition');
});

