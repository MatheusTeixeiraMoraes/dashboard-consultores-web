-- ============================================================
-- Carteira de Clientes (base do módulo Smart Routes / Radar)
--
-- O cliente é ligado ao consultor pelo NOME (consultor_nome), não por
-- id_carteira — é assim que a planilha do sistema de origem entrega os dados e
-- é a "regra do vínculo por nome" da spec. A RLS escopa por esse nome: o
-- consultor vê só os clientes cujo consultor_nome bate com o nome do próprio
-- perfil (comparação sem acento, minúscula, com trim); admin, dono e líder veem
-- tudo. Escrita: admin/dono (qualquer, inclui o import) e o consultor nos seus;
-- líder é somente leitura.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

-- unaccent: usada na RLS para casar "José" com "Jose" etc.
create extension if not exists unaccent;

create table if not exists clientes (
  id                 uuid primary key default gen_random_uuid(),

  -- Dono do cliente, por nome (vínculo por nome).
  consultor_nome     text not null default '',

  -- Identificação do seller
  seller_id          text not null unique,
  seller_nome        text not null default '',
  seller_telefone    text,
  seller_email       text,
  doc_tipo           text check (doc_tipo in ('CPF', 'CNPJ')),
  cpf_cnpj           text,

  -- Endereço + geolocalização (lat/lng nulos = invisível no Radar)
  cidade             text not null default '',
  bairro             text not null default '',
  endereco_completo  text not null default '',
  lat                numeric,
  lng                numeric,

  -- "Cliente Atualizado" protege a linha contra sobrescrita pelo import admin.
  status_atualizacao text not null default 'Cliente não atualizado'
                       check (status_atualizacao in ('Cliente não atualizado', 'Cliente Atualizado')),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references profiles(id)
);

create index if not exists clientes_consultor_idx on clientes(lower(consultor_nome));
create index if not exists clientes_cidade_idx     on clientes(cidade);
create index if not exists clientes_bairro_idx     on clientes(bairro);
create index if not exists clientes_geo_idx        on clientes(lat, lng);

-- Casa o nome do cliente com o nome do consultor logado (sem acento, minúsculo).
create or replace function cliente_e_meu(consultor_nome text)
returns boolean language sql security definer stable as $$
  select lower(unaccent(trim(consultor_nome)))
       = lower(unaccent(trim(coalesce((select nome from profiles where id = auth.uid()), ''))))
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table clientes enable row level security;

create policy "clientes: admin, dono e lider leem tudo" on clientes
  for select using (get_my_role() in ('admin', 'dono', 'lider'));

create policy "clientes: consultor lê os seus (por nome)" on clientes
  for select using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

create policy "clientes: admin e dono inserem qualquer" on clientes
  for insert with check (get_my_role() in ('admin', 'dono'));

create policy "clientes: consultor insere nos seus" on clientes
  for insert with check (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

create policy "clientes: admin e dono atualizam qualquer" on clientes
  for update using (get_my_role() in ('admin', 'dono'));

create policy "clientes: consultor atualiza os seus" on clientes
  for update using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

create policy "clientes: admin e dono apagam qualquer" on clientes
  for delete using (get_my_role() in ('admin', 'dono'));

create policy "clientes: consultor apaga os seus" on clientes
  for delete using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));
