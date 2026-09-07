-- ============================================================================
-- ENCERRAMENTO da categoria temporária Rota Inter/Hexa Recife
--
-- ⚠ DESTRUTIVA E SEM VOLTA. Apaga os clientes da base Hexa e as rotas montadas
-- a partir dela. Autorizada pelo dono em 07/09/2026 ("era uma categoria
-- temporária, não será mais utilizada").
--
-- A categoria nasceu em 04/08/2026 com prazo declarado e este roteiro escrito
-- no rodapé da própria migration de criação
-- (2026-08-04_rota_inter_hexa_recife.sql). É ele, executado.
--
-- O QUE SOBREVIVE, de propósito:
--   - `rotas.origem` (a coluna). O default 'carteira' cobre todo mundo e
--     dropar coluna é destrutivo sem ganho. O front parou de lê-la.
--   - Toda a carteira normal e a agenda das outras rotas. O `delete` é
--     filtrado por origem, e a base Hexa sempre morou em tabela separada —
--     foi exatamente para isto que ela foi separada.
--   - A planilha de origem (`Planilha Aprovados Compilada Hexa.xlsx`), que
--     fora do banco é a única cópia dos 145 clientes. Guardar o arquivo é o
--     que torna este delete reversível na prática.
--
-- O código foi removido no mesmo dia (pasta `dashboard/hexa-recife`, a seção
-- do Sidebar, `lib/hexa-recife.ts`, o selo "Hexa" na Agenda e o gerador de
-- plano de rotas, que só esta categoria usava).
--
-- SEM `begin;`/`commit;` — script curto colado à mão no SQL Editor (ver
-- 2026-08-05_hexa_recife_inclui_lider.sql). Aqui não há ordem perigosa: as duas
-- operações são independentes e nenhuma tela depende mais delas.
--
-- Idempotente: rodar de novo apaga zero linhas e não falha.
-- ============================================================================

-- 1. As rotas montadas a partir da base Hexa. Vivem na MESMA tabela das outras
--    (foi o que deu agenda única ao consultor), então o filtro por origem é o
--    que separa — sem ele isto apagaria a agenda inteira da empresa.
delete from rotas where origem = 'hexa_recife';

-- 2. A base isolada. `cascade` não é preciso: nada referencia esta tabela (é
--    justamente o ponto de ela ter nascido separada de `clientes`).
drop table if exists hexa_recife_clientes;

-- ----------------------------------------------------------------------------
-- Conferência no mesmo run.
--
-- Esperado: a tabela não existe mais (0 linhas na primeira consulta) e nenhuma
-- rota com origem 'hexa_recife' (só 'carteira' na segunda).
-- ----------------------------------------------------------------------------
select tablename from pg_tables
 where schemaname = 'public' and tablename = 'hexa_recife_clientes';

select origem, count(*) as rotas from rotas group by origem order by origem;
