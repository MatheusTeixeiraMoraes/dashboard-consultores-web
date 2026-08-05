-- ============================================================================
-- Rota Inter/Hexa Recife: LÍDER volta a ler a base
--
-- Terceira decisão sobre quem entra nesta categoria, e a última mantém o
-- histórico legível:
--   04/08  admin, dono e líder liam; consultor lia os do próprio nome
--   05/08  só admin e dono (2026-08-05_hexa_recife_so_admin_e_dono.sql)
--   05/08  admin, dono e LÍDER — esta aqui. Consultor continua FORA.
--
-- Leitura, e só. As três policies de escrita continuam exclusivas do admin: o
-- líder consulta a base e monta rota, não sobe planilha nem apaga cliente.
--
-- ---------------------------------------------------------------------------
-- SEM `begin;`/`commit;`, DE PROPÓSITO.
--
-- A migration de restrição foi escrita em transação explícita e rodou DUAS
-- vezes no SQL Editor do Supabase devolvendo "Success. No rows returned" sem
-- gravar nada — pg_policies continuava mostrando as policies antigas. Em script
-- curto colado à mão, autocommit é o que se comporta.
--
-- Para isso ser seguro, a ORDEM importa: a policy nova entra ANTES de a antiga
-- sair. Se algo falhar no meio, a tabela nunca fica sem policy de SELECT — o
-- que, com RLS ligada, trancaria a base inclusive para o admin.
--
-- Rodar no SQL Editor do Supabase. É re-executável.
-- ============================================================================

-- 1. Acesso novo: os três papéis de gestão.
drop policy if exists "hexa: gestao le tudo" on hexa_recife_clientes;

create policy "hexa: gestao le tudo" on hexa_recife_clientes
  for select using ((select get_my_role()) in ('admin', 'dono', 'lider'));

-- 2. Só agora sai a policy anterior. Policies de SELECT se somam em OR: deixar
--    as duas não daria acesso a mais ninguém (uma é subconjunto da outra), mas
--    duas policies dizendo a mesma coisa é como se perde o rastro de quem lê o
--    quê.
drop policy if exists "hexa: admin e dono leem" on hexa_recife_clientes;

-- 3. Conferência no mesmo run, para o resultado aparecer na tela.
--    Esperado: 4 linhas — a de SELECT citando admin, dono e lider, e as três de
--    escrita citando só admin.
select policyname, cmd, qual
  from pg_policies
 where schemaname = 'public' and tablename = 'hexa_recife_clientes'
 order by policyname;
