// js/auth.js
// Lógica de autenticação

// Aguardar DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se já está logado - se sim, ir para dashboard
    if (sessionStorage.getItem('usuario')) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const senha = document.getElementById('password').value;
            const btn = document.querySelector('.btn-login');
            
            if (!email || !senha) {
                mostrarNotificacao('Preencha todos os campos!', 'error');
                return;
            }
            
            btn.disabled = true;
            btn.textContent = 'Entrando...';
            
            try {
                // Buscar usuário na tabela usuarios
                const { data, error } = await supabaseClient
                    .from('usuarios')
                    .select('id, nome, email, perfil, nivel_acesso, ativo, permissoes')
                    .eq('email', email)
                    .eq('senha', senha)
                    .maybeSingle();
                
                if (error) {
                    console.error('Erro na consulta:', error);
                    throw new Error('Erro ao conectar com o banco de dados');
                }
                
                if (!data) {
                    throw new Error('Email ou senha inválidos!');
                }
                
                if (!data.ativo) {
                    throw new Error('Usuário inativo! Contate o administrador.');
                }
                
                // Salvar sessão com todas as informações
                const usuarioLogado = {
                    id: data.id,
                    nome: data.nome,
                    email: data.email,
                    perfil: data.perfil || 'basico',
                    nivel_acesso: data.nivel_acesso || 'basico',
                    permissoes: data.permissoes || {},
                    ativo: data.ativo
                };
                
                sessionStorage.setItem('usuario', JSON.stringify(usuarioLogado));
                
                // Atualizar último acesso
                await supabaseClient
                    .from('usuarios')
                    .update({ ultimo_acesso: new Date().toISOString() })
                    .eq('id', data.id);
                
                mostrarNotificacao(`Bem-vindo, ${data.nome}!`, 'success');
                
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 500);
                
            } catch (error) {
                console.error('Erro no login:', error);
                mostrarNotificacao(error.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }
        });
    }
});