-- ============================================================
-- Reconcilia o banco EXISTENTE com supabase/schema.sql
--
-- O schema.sql estava defasado: não tinha a coluna `metricas`, não tinha as
-- policies de DELETE e não tinha a trava de unicidade dos uploads. Parte disso
-- já foi aplicada à mão em produção; esta migration formaliza tudo e é
-- IDEMPOTENTE — rodar de novo não quebra nada.
--
-- Não apaga dados. Não recria o trigger on_auth_user_created (removido de
-- propósito: quem cria o profile é /api/usuarios/criar).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Colunas que o schema.sql não documentava
-- ------------------------------------------------------------
alter table score_consultor_resultados
  add column if not exists metricas jsonb;

alter table score_consultor_resultados
  add column if not exists total_a_reverter numeric;

-- ------------------------------------------------------------
-- 2. Trava de unicidade dos uploads
--
-- Um pilar só pode ter um lote por data de referência. O app apaga o lote
-- anterior antes de reenviar, então em uso normal isto nunca dispara: existe
-- para o cliente desatualizado que insere sem apagar, que antes duplicava o
-- lote em silêncio e fazia as telas somarem dados repetidos.
--
-- Se esta migration falhar aqui, é porque JÁ EXISTE duplicata no banco. Rode
-- o diagnóstico do rodapé antes de tentar de novo.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'score_uploads_pilar_data_unico'
  ) then
    alter table score_uploads
      add constraint score_uploads_pilar_data_unico
      unique (pilar_key, data_referencia);
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Policies de DELETE
--
-- Sem elas o upsert do upload falha EM SILÊNCIO: com RLS ligado e nenhuma
-- policy de delete, o Postgres não devolve erro — apenas apaga zero linhas.
-- O lote antigo fica no banco e o novo entra por cima.
-- ------------------------------------------------------------
drop policy if exists "uploads: admin e dono apagam" on score_uploads;
create policy "uploads: admin e dono apagam" on score_uploads
  for delete using (get_my_role() in ('admin', 'dono'));

drop policy if exists "resultados: admin e dono apagam" on score_consultor_resultados;
create policy "resultados: admin e dono apagam" on score_consultor_resultados
  for delete using (get_my_role() in ('admin', 'dono'));

commit;

-- ============================================================
-- DIAGNÓSTICO — rode se o passo 2 falhar (duplicata pré-existente)
-- ============================================================
-- select pilar_key, data_referencia, count(*)
--   from score_uploads
--  group by 1, 2
-- having count(*) > 1
--  order by 2 desc, 1;
--
-- Para limpar, mantendo o upload mais recente de cada pilar+data:
--
-- delete from score_uploads u
--  where exists (
--    select 1 from score_uploads mais_novo
--     where mais_novo.pilar_key       = u.pilar_key
--       and mais_novo.data_referencia = u.data_referencia
--       and mais_novo.uploaded_at     > u.uploaded_at
--  );
-- (os resultados somem junto: score_consultor_resultados tem on delete cascade)
