-- ============================================================
-- Faixas de meta de Acionáveis editáveis (deixam de ser hardcoded no código).
--
-- A meta de Acionáveis virou "quantidade fixa de tarefas revertidas, por
-- tamanho de carteira" (ver fix(pilares) anterior). Essa quantidade o MP
-- manda de novo TODO MÊS — sem esta tabela, cada mudança exigia editar
-- src/lib/pilares.ts e fazer deploy. Agora é editável em /dashboard/metas,
-- mesmo padrão de permissão de pillar_config (qualquer ativo lê, só
-- admin/dono edita).
--
-- Idempotente.
-- ============================================================

create table if not exists metas_acionaveis_faixas (
  id            uuid primary key default gen_random_uuid(),
  -- A partir de quantos clientes na carteira esta faixa vale.
  min_carteira  integer not null unique,
  meta_tarefas  integer not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles(id) on delete set null
);

alter table metas_acionaveis_faixas enable row level security;

drop policy if exists "metas_acionaveis_faixas: usuário ativo lê" on metas_acionaveis_faixas;
create policy "metas_acionaveis_faixas: usuário ativo lê" on metas_acionaveis_faixas
  for select using (get_my_role() is not null);

drop policy if exists "metas_acionaveis_faixas: admin e dono editam" on metas_acionaveis_faixas;
create policy "metas_acionaveis_faixas: admin e dono editam" on metas_acionaveis_faixas
  for all using (get_my_role() in ('admin', 'dono'));

-- Faixas vigentes em 20/08/2026, validadas contra os 11 consultores reais.
insert into metas_acionaveis_faixas (min_carteira, meta_tarefas) values
  (1, 6), (101, 8), (201, 10), (301, 12), (401, 15), (501, 15)
on conflict (min_carteira) do nothing;
