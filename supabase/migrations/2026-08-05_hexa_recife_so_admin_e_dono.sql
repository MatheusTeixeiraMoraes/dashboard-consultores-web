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
-- Rodar no SQL Editor do Supabase. É re-executável.
-- ============================================================================

begin;

-- Some o acesso do consultor.
drop policy if exists "hexa: consultor le os seus (por nome)" on hexa_recife_clientes;

-- Troca a de gestão por uma sem o líder. O `drop` da nova antes do `create`
-- deixa o script re-executável: `create policy` não aceita `if not exists` e o
-- erro 42710 aborta a transação inteira.
drop policy if exists "hexa: gestao le tudo" on hexa_recife_clientes;
drop policy if exists "hexa: admin e dono leem" on hexa_recife_clientes;
create policy "hexa: admin e dono leem" on hexa_recife_clientes
  for select using ((select get_my_role()) in ('admin', 'dono'));

commit;


-- ============================================================================
-- CONFERÊNCIA depois de rodar
--
-- Têm que sobrar 4 policies, e NENHUMA pode mencionar consultor ou lider:
--
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'hexa_recife_clientes';
--
--   esperado:
--     hexa: admin e dono leem   SELECT
--     hexa: so admin importa    INSERT
--     hexa: so admin atualiza   UPDATE
--     hexa: so admin apaga      DELETE
--
-- Se aparecer 5 linhas, alguma policy velha sobreviveu — e como policies de
-- SELECT se somam em OR, a antiga voltaria a dar acesso ao consultor.
-- ============================================================================
