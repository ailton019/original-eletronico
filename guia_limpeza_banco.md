# ⚠️ Guia para Limpeza e Zeramento de Dados (Banco de Dados)

Este guia orienta como limpar com segurança todas as transações de teste (vendas, entradas de estoque e seriais) para iniciar a operação real do sistema do zero.

---

## 🚫 ATENÇÃO: Faça um Backup Antes!
Antes de executar qualquer comando de exclusão, é recomendável extrair um backup dos dados atuais caso precise de histórico futuro. A exclusão de dados é irreversível.

---

## 💻 Como Executar no Supabase

1. Acesse o painel do seu projeto no [Supabase Dashboard](https://supabase.com).
2. No menu lateral esquerdo, clique em **SQL Editor** (ícone `SQL`).
3. Clique em **New query** (Nova consulta).
4. Copie o script SQL abaixo, cole no campo de texto e clique no botão **Run** (Executar) no canto inferior direito.

---

## 📝 Script SQL de Limpeza

O script abaixo remove todas as movimentações e reinicia os contadores de ID (fazendo com que a próxima venda/entrada comece no número `1`).

```sql
-- 1. Excluir itens das vendas (saídas)
DELETE FROM public.saida_itens;

-- 2. Excluir cabeçalhos das vendas (saídas)
DELETE FROM public.saidas;

-- 3. Excluir itens das compras/estoque (entradas)
DELETE FROM public.entrada_itens;

-- 4. Excluir cabeçalhos das compras/estoque (entradas)
DELETE FROM public.entradas;

-- 5. Excluir histórico de movimentações de estoque
DELETE FROM public.movimentos_estoque;

-- 6. Excluir histórico de números de série / IMEI
DELETE FROM public.produtos_seriais;

-- 7. Zerar saldo físico de estoque de todos os produtos (zera estoque e estoque_total)
UPDATE public.produtos SET estoque_total = 0;
-- Executar linha abaixo apenas se a sua tabela possuir a coluna 'estoque':
-- UPDATE public.produtos SET estoque = 0;


-- =====================================================
-- REINICIAR CONTADORES DE ID (AUTO-INCREMENTO)
-- =====================================================

-- Reiniciar contadores para começarem do 1 novamente
ALTER SEQUENCE public.saidas_id_seq RESTART WITH 1;
ALTER SEQUENCE public.saida_itens_id_seq RESTART WITH 1;
ALTER SEQUENCE public.entradas_id_seq RESTART WITH 1;
ALTER SEQUENCE public.entrada_itens_id_seq RESTART WITH 1;
ALTER SEQUENCE public.produtos_seriais_id_seq RESTART WITH 1;
ALTER SEQUENCE public.movimentos_estoque_id_seq RESTART WITH 1;
```

---

## ❓ O que este script faz e o que ele preserva?

- **O que é apagado:**
  - Todas as vendas registradas (PDV).
  - Todas as entradas e compras de estoque registradas.
  - Todos os números de série e IMEIs vinculados a produtos.
- **O que é zerado:**
  - O saldo do estoque de todos os produtos cadastrados volta a ser `0` (prontos para receber as contagens reais).
- **O que é preservado (NÃO APAGADO):**
  - O cadastro de **Produtos** (nomes, códigos, preços, categorias).
  - O cadastro de **Clientes** (nome, CPF, telefone).
  - O cadastro de **Fornecedores**.
  - O cadastro de **Usuários** e suas respectivas permissões de login.
