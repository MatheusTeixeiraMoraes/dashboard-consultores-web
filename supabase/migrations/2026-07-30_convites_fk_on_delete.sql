-- ============================================================
-- Conserta as duas foreign keys de `convites_acesso` para `on delete set null`.
--
-- SEM isto, o Postgres RECUSA excluir qualquer usuário que tenha gerado ou
-- aceitado um convite:
--   ERROR 23503: update or delete on table "profiles" violates foreign key
--   constraint "convites_acesso_criado_por_fkey"
-- Ou seja: todo consultor que entra pelo link vira um usuário impossível de
-- excluir pelo painel. Confirmado em produção em 30/07/2026.
--
-- A referência aqui é histórica: se a pessoa sai do sistema, o convite continua
-- registrado e apenas perde o ponteiro. Não é cascade — apagar um usuário não
-- pode apagar o histórico de convites.
--
-- POR QUE ESTE ARQUIVO EXISTE, em vez de re-rodar a migration de 29/07:
-- aquela tem `create policy`, que o Postgres NÃO aceita como
-- `create policy if not exists` — re-executá-la falha com
-- "policy ... already exists". Pior: as policies de INSERT/UPDATE que ela cria
-- foram REMOVIDAS de propósito pela migration
-- `2026-07-30_fecha_convites_e_profiles.sql` (um dono forjava convite com
-- role=admin escrevendo direto no PostgREST). Rodar a de 29/07 de novo
-- ressuscitaria exatamente esse furo. Ela fica como registro histórico; o
-- conserto vem aqui.
--
-- Este arquivo, sim, é idempotente: `drop constraint if exists` + `add`.
-- ============================================================

alter table convites_acesso drop constraint if exists convites_acesso_criado_por_fkey;
alter table convites_acesso add  constraint convites_acesso_criado_por_fkey
  foreign key (criado_por) references profiles(id) on delete set null;

alter table convites_acesso drop constraint if exists convites_acesso_usado_por_fkey;
alter table convites_acesso add  constraint convites_acesso_usado_por_fkey
  foreign key (usado_por) references profiles(id) on delete set null;
