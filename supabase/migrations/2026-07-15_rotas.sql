-- ============================================================
-- Rotas salvas (módulo Smart Routes — abas Roteirizar e Agenda)
--
-- Uma rota é um conjunto ordenado de paradas (clientes), com ponto de partida,
-- chegada opcional, distância e tempo calculados. Pertence a um consultor pelo
-- NOME, igual à tabela clientes (reusa a função cliente_e_meu).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create table if not exists rotas (
  id               uuid primary key default gen_random_uuid(),
  consultor_nome   text not null default '',

  nome_rota        text not null default '',
  data_visita      date,

  partida_endereco text,
  partida_lat      numeric,
  partida_lng      numeric,
  chegada_endereco text,
  chegada_lat      numeric,
  chegada_lng      numeric,

  -- Paradas na ordem otimizada: [{seller_id, seller_nome, lat, lng, telefone,
  -- endereco, cidade, bairro}, ...]
  stops            jsonb not null default '[]'::jsonb,
  distancia_km     numeric,
  tempo_minutos    numeric,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id)
);

create index if not exists rotas_consultor_idx on rotas(lower(consultor_nome));
create index if not exists rotas_data_idx       on rotas(data_visita);

-- ============================================================
-- RLS — mesmo padrão de clientes (vínculo por nome via cliente_e_meu).
-- ============================================================
alter table rotas enable row level security;

create policy "rotas: admin, dono e lider leem tudo" on rotas
  for select using (get_my_role() in ('admin', 'dono', 'lider'));
create policy "rotas: consultor lê as suas (por nome)" on rotas
  for select using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

create policy "rotas: admin e dono inserem qualquer" on rotas
  for insert with check (get_my_role() in ('admin', 'dono'));
create policy "rotas: consultor insere as suas" on rotas
  for insert with check (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

create policy "rotas: admin e dono atualizam qualquer" on rotas
  for update using (get_my_role() in ('admin', 'dono'));
create policy "rotas: consultor atualiza as suas" on rotas
  for update using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

create policy "rotas: admin e dono apagam qualquer" on rotas
  for delete using (get_my_role() in ('admin', 'dono'));
create policy "rotas: consultor apaga as suas" on rotas
  for delete using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));
