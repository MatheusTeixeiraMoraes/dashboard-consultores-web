-- ============================================================
-- Faixas do Score Geral editáveis (Crítico / Alerta / Objetivo).
--
-- Os limites que classificam o score consolidado do consultor (Crítico /
-- Alerta / Acima do objetivo) estavam hardcoded no código -- e DUPLICADOS,
-- cada cópia com o MESMO valor mas nenhuma ligação entre si: scoreStatus()
-- em src/lib/types.ts, statusStyle() e o cálculo de stats em GeralClient.tsx,
-- e isCritico/naLinha direto em alertas/page.tsx.
--
-- Pedido explícito: os cortes mudam TODO MÊS (crítico abaixo de 7, alerta de
-- 7,01 a 7,99, objetivo em 8), então tem que ser editável em /dashboard/metas
-- sem deploy -- mesmo motivo por trás de metas_acionaveis_faixas.
--
-- Singleton (id fixo em 1): só existe UM score geral pra configurar, não faz
-- sentido várias linhas. Mesmo padrão de permissão de pillar_config e
-- metas_acionaveis_faixas (qualquer ativo lê, só admin/dono edita).
--
-- Idempotente.
-- ============================================================

create table if not exists score_geral_faixas (
  id              smallint primary key default 1 check (id = 1),
  -- Score menor que isto = "Crítico".
  limite_critico  numeric not null,
  -- Score maior ou igual a isto = objetivo atingido ("Acima do objetivo").
  -- Entre limite_critico e meta_objetivo = "Alerta".
  meta_objetivo   numeric not null check (meta_objetivo > limite_critico),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null
);

alter table score_geral_faixas enable row level security;

drop policy if exists "score_geral_faixas: usuário ativo lê" on score_geral_faixas;
create policy "score_geral_faixas: usuário ativo lê" on score_geral_faixas
  for select using (get_my_role() is not null);

drop policy if exists "score_geral_faixas: admin e dono editam" on score_geral_faixas;
create policy "score_geral_faixas: admin e dono editam" on score_geral_faixas
  for all using (get_my_role() in ('admin', 'dono'));

-- Faixas vigentes em 01/09/2026.
insert into score_geral_faixas (id, limite_critico, meta_objetivo) values (1, 7.0, 8.0)
on conflict (id) do nothing;
