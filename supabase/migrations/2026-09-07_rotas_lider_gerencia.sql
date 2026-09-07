-- ============================================================================
-- Rotas: LÍDER passa a gerenciar (não só ler)
--
-- BUG: líder recebia "new row violates row-level security policy for table
-- rotas" ao salvar rota na agenda (Roteirizar, Clientes → Gerar rota, Plano de
-- rotas e Hexa Recife → Roteirizar, todos gravam consultor_nome = nome de quem
-- salva).
--
-- CAUSA: desde 2026-07-15 o papel `lider` só aparece na policy de SELECT de
-- `rotas`. As três de escrita citam ('admin','dono'), e a do consultor exige
-- consultor_nome = nome dele — nenhuma casa com um líder. O insert não tinha
-- como passar. O mesmo valia, silenciosamente, para renomear/agendar/refazer/
-- excluir na Agenda: o líder vê TODAS as rotas (policy de SELECT) e a tela
-- mostra os botões, mas qualquer um deles morria no RLS.
--
-- DECISÃO (07/09/2026): líder escreve como admin e dono — cria as próprias
-- rotas e edita/agenda/refaz/exclui a de qualquer consultor. É o papel de
-- gestão de campo, e é exatamente o que a Agenda já lhe mostra na tela. O
-- consultor continua restrito às suas (nada abaixo toca nas policies dele).
--
-- Não confundir com a rota Inter/Hexa Recife: ali a escrita é da BASE de
-- clientes e continua exclusiva do admin (2026-08-05_hexa_recife_inclui_lider).
-- O que muda aqui é a tabela `rotas`, onde o líder já lia tudo.
--
-- ---------------------------------------------------------------------------
-- SEM `begin;`/`commit;`, DE PROPÓSITO — script curto colado no SQL Editor do
-- Supabase já devolveu "Success. No rows returned" sem gravar nada dentro de
-- transação explícita (ver 2026-08-05_hexa_recife_inclui_lider.sql). Em
-- autocommit, a ORDEM é o que dá segurança: cada policy nova entra ANTES de a
-- antiga sair, então nunca existe um instante em que admin/dono percam a
-- escrita.
--
-- Nomes copiados LITERALMENTE de 2026-07-31_rls_sem_funcao_opaca.sql — um
-- `drop policy if exists` com nome errado NÃO falha, só deixa a policy velha
-- viva ao lado da nova.
--
-- Rodar no SQL Editor do Supabase. É re-executável.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INSERT — o erro que o líder via ao clicar em "Salvar rota".
-- ----------------------------------------------------------------------------
drop policy if exists "rotas: gestao insere qualquer" on rotas;

create policy "rotas: gestao insere qualquer" on rotas
  for insert with check ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "rotas: admin e dono inserem qualquer" on rotas;

-- ----------------------------------------------------------------------------
-- 2. UPDATE — renomear, marcar o dia da visita e "Refazer", na Agenda.
--
-- `with check` explícito com a MESMA expressão do `using`: sem ele o Postgres
-- reaproveita o `using` como check da linha nova, o que aqui daria no mesmo
-- (a expressão só olha o papel, nenhuma coluna). Fica escrito para esta policy
-- não virar mais um caso da armadilha "using não restringe coluna" se um dia
-- alguém acrescentar condição de linha aqui.
--
-- (As policies de UPDATE do consultor continuam só com `using`, o que ainda
-- permite a ele reatribuir a própria rota para outro nome. Isso é anterior a
-- esta migration, está registrado como issue própria em
-- 2026-07-31_rls_sem_funcao_opaca.sql e NÃO é mexido aqui.)
-- ----------------------------------------------------------------------------
drop policy if exists "rotas: gestao atualiza qualquer" on rotas;

create policy "rotas: gestao atualiza qualquer" on rotas
  for update
   using ((select get_my_role()) in ('admin', 'dono', 'lider'))
  with check ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "rotas: admin e dono atualizam qualquer" on rotas;

-- ----------------------------------------------------------------------------
-- 3. DELETE — o botão de excluir rota na Agenda.
-- ----------------------------------------------------------------------------
drop policy if exists "rotas: gestao apaga qualquer" on rotas;

create policy "rotas: gestao apaga qualquer" on rotas
  for delete using ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "rotas: admin e dono apagam qualquer" on rotas;

-- ----------------------------------------------------------------------------
-- 4. Conferência no mesmo run, para o resultado aparecer na tela.
--
-- Esperado: 8 linhas — 4 de gestão e 4 de consultor.
--   rotas: gestao apaga qualquer            DELETE  admin, dono, lider
--   rotas: consultor apaga as suas          DELETE  consultor + nome
--   rotas: gestao insere qualquer           INSERT  admin, dono, lider
--   rotas: consultor insere as suas         INSERT  consultor + nome
--   rotas: admin, dono e lider leem tudo    SELECT  admin, dono, lider
--   rotas: consultor lê as suas (por nome)  SELECT  consultor + nome
--   rotas: gestao atualiza qualquer         UPDATE  admin, dono, lider
--   rotas: consultor atualiza as suas       UPDATE  consultor + nome
-- Se sobrar alguma "admin e dono ...", um dos drops acima não pegou (nome
-- errado não falha, só não faz nada): confira o nome antes de seguir.
-- ----------------------------------------------------------------------------
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'rotas'
 order by cmd, policyname;
