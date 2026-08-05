-- ============================================================================
-- Rota Inter/Hexa Recife: acesso restrito a ADMIN e DONO
--
-- Decisão do dono em 05/08/2026, mudando o que foi combinado em 04/08: a
-- categoria é ferramenta de gestão. Consultor não entra — e LÍDER também não,
-- ao contrário das outras telas de carteira, onde líder lê tudo.
--
-- Estado anterior (migration de 04/08):
--   "hexa: gestao le tudo"                  select para admin, dono e lider
--   "hexa: consultor le os seus (por nome)" select escopado por nome
--
-- Depois desta:
--   "hexa: admin e dono leem"               select para admin e dono
--   (as três de escrita continuam só admin, sem mudança)
--
-- POR QUE MEXER NO BANCO E NÃO SÓ NO MENU: esconder o item da barra lateral não
-- fecha nada. A chave anon vai no navegador de todo mundo, então bastaria uma
-- sessão de consultor e uma chamada direta ao PostgREST para ler a base inteira
-- se a policy dele continuasse existindo. Quem decide quem lê é a RLS; a tela é
-- só conveniência.
--
-- ---------------------------------------------------------------------------
-- SEM `begin;`/`commit;`, DE PROPÓSITO — e isto foi aprendido na marra.
--
-- A primeira versão deste arquivo vinha em transação explícita. No SQL Editor do
-- Supabase ela rodou DUAS vezes devolvendo "Success. No rows returned" e, nas
-- duas, nada foi gravado: a consulta a pg_policies depois mostrava as policies
-- antigas intactas. Um "Success" que não grava é pior que um erro, porque
-- ninguém vai conferir.
--
-- Aqui cada comando roda em autocommit. Para isso ser seguro, a ORDEM importa:
-- a policy nova é criada ANTES de as antigas serem removidas. Se algo falhar no
-- meio, a tabela nunca fica sem policy de SELECT — o que, com RLS ligada,
-- trancaria a base para todo mundo, inclusive o admin.
--
-- Rodar no SQL Editor do Supabase. É re-executável.
-- ============================================================================

-- 1. Cria o acesso novo (admin e dono). O `drop` antes existe só para o script
--    poder rodar de novo: `create policy` não aceita `if not exists`.
drop policy if exists "hexa: admin e dono leem" on hexa_recife_clientes;

create policy "hexa: admin e dono leem" on hexa_recife_clientes
  for select using ((select get_my_role()) in ('admin', 'dono'));

-- 2. Só agora remove os acessos antigos. Policies de SELECT se somam em OR:
--    enquanto estas existirem, consultor e líder continuam lendo.
drop policy if exists "hexa: consultor le os seus (por nome)" on hexa_recife_clientes;

drop policy if exists "hexa: gestao le tudo" on hexa_recife_clientes;

-- 3. Conferência no mesmo run — o resultado aparece na tela em vez de exigir
--    uma segunda consulta que alguém pode esquecer de rodar.
--    Esperado: 4 linhas, nenhuma mencionando consultor ou lider.
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'hexa_recife_clientes'
 order by policyname;
