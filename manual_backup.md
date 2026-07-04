# 💾 Manual do Backup Automático Semanal em Excel

Este documento explica como configurar o sistema para gerar planilhas em Excel (`.xlsx`) com todas as tabelas do Supabase a cada 7 dias e enviá-las automaticamente para o seu e-mail.

---

## 🛠️ Como funciona?

Utilizamos o **GitHub Actions** (que roda na nuvem do GitHub de forma 100% gratuita) associado a um script em Node.js que consome os dados do Supabase, cria as abas no Excel e envia para você através da plataforma de e-mails **Resend** (grátis até 3.000 e-mails por mês).

---

## 📋 Passo a Passo para Configuração

### Passo 1: Criar conta na Resend
1. Acesse [resend.com](https://resend.com) e crie uma conta gratuita.
2. No painel principal, acesse a aba **API Keys**.
3. Clique em **Create API Key**, dê um nome para ela (ex: `backup-vendas`) e copie a chave gerada (ela começa com `re_...`).

### Passo 2: Configurar Segredos no GitHub
1. Vá até o repositório do seu projeto no GitHub.
2. Clique na aba **Settings** (Configurações) no topo.
3. No menu lateral esquerdo, clique em **Secrets and variables** (Segredos e variáveis) e depois selecione **Actions**.
4. Clique no botão **New repository secret** (Novo segredo de repositório) no canto superior direito para cadastrar as **4 variáveis** abaixo:

| Nome do Segredo | Conteúdo / Valor |
| :--- | :--- |
| `SUPABASE_URL` | Sua URL do Supabase (ex: `https://limlumccmvekwvglfgtx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Sua chave Anon Key do Supabase (aquela chave longa) |
| `RESEND_API_KEY` | A API Key que você copiou do **Passo 1** (`re_...`) |
| `EMAIL_DESTINATARIO` | Seu e-mail pessoal onde deseja receber as planilhas do backup |

### Passo 3: Enviar as alterações para o GitHub
Envie as pastas criadas (`.github` e `scripts`) para o seu repositório no GitHub rodando os comandos abaixo no terminal (ou usando seu aplicativo de controle do Git):
```bash
git add .git 
git commit -m "feat: adiciona rotina de backup semanal por e-mail"
git push
```

---

## 📅 Executando ou Testando

- **Execução Automática:** O backup está programado no arquivo [backup.yml](file:///C:/Users/ailton.cordeiro/Downloads/minha_maquina/Dados%20coletados%20BO´s/Documentos/GitHub/empresa-new/original-eletronico/.github/workflows/backup.yml) para rodar automaticamente **todo domingo às 00:00** (Horário de Brasília).
- **Execução Manual (Para Testar agora):**
  1. Vá até o repositório no GitHub e clique na aba **Actions**.
  2. Clique em **Backup Semanal Supabase em Excel** na barra lateral.
  3. Clique no menu dropdown **Run workflow** e depois no botão **Run workflow** verde.
  4. O script rodará e, em menos de 1 minuto, o Excel com todas as tabelas estará na sua caixa de entrada!
