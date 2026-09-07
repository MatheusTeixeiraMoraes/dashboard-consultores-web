-- ============================================================================
-- Rotas: remove as policies de escrita duplicadas (faxina pós-31/07)
--
-- O QUE ACONTECEU (07/09/2026, nesta ordem):
--   1. 2026-09-07_rotas_lider_gerencia.sql rodou: criou as três
--      "rotas: gestao ..." (admin, dono, lider) e dropou as três antigas
--      "rotas: admin e dono ...". Conferido em pg_policies: 8 linhas, certo.
--   2. Depois disso, 2026-07-31_rls_sem_funcao_opaca.sql foi rodada (ela nunca
--      tinha sido aplicada neste banco — as policies ainda estavam na forma
--      antiga, com cliente_e_meu() por linha). Ela RECRIA os nomes antigos,
--      então as três "rotas: admin e dono ..." ressuscitaram ao lado das de
--      gestão.
--
-- POR QUE ISSO NÃO QUEBROU O LÍDER: policies permissivas somam em OR e
-- "gestao" é superconjunto de "admin e dono". O acesso está correto; o que
-- está errado é o RASTRO — duas policies para a mesma coisa, e uma delas
-- dizendo "admin e dono" numa tabela onde o líder escreve. Quem ler
-- pg_policies daqui a um mês vai concluir o contrário do que vale.
--
-- Esta migration só APAGA as redundantes. Nada é criado: se um drop não
-- encontrar a policy (caso a de 31/07 não tenha gravado), ele não faz nada e o
-- script segue.
--
-- SEM `begin;`/`commit;` — script curto colado à mão (ver
-- 2026-08-05_hexa_recife_inclui_lider.sql). Aqui a ordem é trivialmente
-- segura: a policy que dá o acesso ("gestao") já existe e não é tocada.
--
-- Rodar no SQL Editor do Supabase. É re-executável.
-- ============================================================================

drop policy if exists "rotas: admin e dono inserem qualquer"  on rotas;
drop policy if exists "rotas: admin e dono atualizam qualquer" on rotas;
drop policy if exists "rotas: admin e dono apagam qualquer"    on rotas;

-- ----------------------------------------------------------------------------
-- Conferência 1 — as policies de `rotas`.
--
-- Esperado: 8 linhas, nenhuma começando por "rotas: admin e dono".
--   rotas: gestao apaga qualquer            DELETE  admin, dono, lider
--   rotas: consultor apaga as suas          DELETE  consultor + nome
--   rotas: gestao insere qualquer           INSERT  admin, dono, lider
--   rotas: consultor insere as suas         INSERT  consultor + nome
--   rotas: admin, dono e lider leem tudo    SELECT  admin, dono, lider
--   rotas: consultor lê as suas (por nome)  SELECT  consultor + nome
--   rotas: gestao atualiza qualquer         UPDATE  admin, dono, lider
--   rotas: consultor atualiza as suas       UPDATE  consultor + nome
-- ----------------------------------------------------------------------------
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'rotas'
 order by cmd, policyname;

-- ----------------------------------------------------------------------------
-- Conferência 2 — a de 31/07 realmente gravou?
--
-- É a consulta que o cabeçalho daquela migration mandou rodar. Se ela pegou,
-- NENHUMA policy chama mais cliente_e_meu() e isto devolve ZERO linhas. Se
-- devolver linhas, aquele run foi um "Success" que não gravou (já aconteceu
-- neste projeto) e a otimização de RLS continua faltando.
-- ----------------------------------------------------------------------------
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and (qual like '%cliente_e_meu%' or with_check like '%cliente_e_meu%')
 order by tablename, policyname;

-- ----------------------------------------------------------------------------
-- Conferência 3 — contagem por tabela, para flagrar duplicação em qualquer
-- outra tabela que a de 31/07 tenha tocado.
--
-- Esperado: clientes 8, rotas 8, mp_carteira 4, mp_acionaveis 4.
-- ----------------------------------------------------------------------------
select tablename, count(*) as policies
  from pg_policies
 where schemaname = 'public'
   and tablename in ('clientes', 'rotas', 'mp_carteira', 'mp_acionaveis')
 group by tablename
 order by tablename;
