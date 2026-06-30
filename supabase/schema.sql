-- ============================================================
-- LIMPEZA (caso já exista estrutura anterior)
-- ============================================================
drop table if exists score_consultor_resultados cascade;
drop table if exists score_uploads cascade;
drop table if exists pillar_config cascade;
drop table if exists profiles cascade;
drop table if exists upload_records cascade;
drop table if exists uploads cascade;
drop type  if exists user_role cascade;

-- ============================================================
-- 1. ENUM DE ROLES
-- ============================================================
create type user_role as enum ('admin', 'dono', 'lider', 'consultor');

-- ============================================================
-- 2. PROFILES
-- Estende auth.users com role, nome e id_carteira
-- ============================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nome         text not null default '',
  email        text not null default '',
  role         user_role not null default 'consultor',
  id_carteira  text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Cria profile automaticamente ao criar usuário no Supabase Auth
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 3. CONFIGURAÇÃO DOS PILARES (metas editáveis)
-- ============================================================
create table pillar_config (
  id           uuid primary key default gen_random_uuid(),
  pilar_key    text not null unique check (pilar_key in (
                 'awareness','produtividade','aderencia',
                 'net_churn','tpv','acionaveis')),
  label        text not null,
  categoria    text not null check (categoria in ('atuacao','resultado')),
  meta         numeric not null,
  pontos_max   numeric not null,
  unidade      text not null check (unidade in ('%','numero')),
  tipo_comp    text not null default 'ge' check (tipo_comp in ('ge','le')),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id)
);

-- Seed: valores oficiais do documento
insert into pillar_config (pilar_key, label, categoria, meta, pontos_max, unidade, tipo_comp) values
  ('awareness',      'Awareness',              'atuacao',   55.0,  1.5, '%',     'ge'),
  ('produtividade',  'Produtividade',           'atuacao',    9.0,  0.5, 'numero','ge'),
  ('aderencia',      'Aderência a Agenda',      'atuacao',   80.0,  1.0, '%',     'ge'),
  ('net_churn',      'Net Churn',               'resultado', -1.59, 3.0, '%',     'ge'),
  ('tpv',            'TPV',                     'resultado', 109.0, 1.0, '%',     'ge'),
  ('acionaveis',     'Acionáveis Comerciais',   'resultado', 40.0,  3.0, '%',     'ge');

-- ============================================================
-- 4. UPLOADS DE PLANILHA
-- ============================================================
create table score_uploads (
  id               uuid primary key default gen_random_uuid(),
  uploaded_by      uuid not null references profiles(id),
  pilar_key        text not null check (pilar_key in (
                     'awareness','produtividade','aderencia',
                     'net_churn','tpv','acionaveis')),
  filename         text not null,
  mes_referencia   date,
  data_referencia  date,
  record_count     int not null default 0,
  uploaded_at      timestamptz not null default now()
);

-- ============================================================
-- 5. RESULTADOS POR CONSULTOR
-- ============================================================
create table score_consultor_resultados (
  id               uuid primary key default gen_random_uuid(),
  upload_id        uuid not null references score_uploads(id) on delete cascade,
  id_carteira      text not null,
  consultor_nome   text not null,
  pilar_key        text not null,
  valor_metrica    numeric not null,
  score_planilha   numeric not null default 0,
  mes_referencia   date,
  data_referencia  date
);

create index on score_consultor_resultados(upload_id);
create index on score_consultor_resultados(id_carteira);
create index on score_consultor_resultados(pilar_key);
create index on score_consultor_resultados(mes_referencia);
create index on score_consultor_resultados(data_referencia);

-- ============================================================
-- 6. FUNÇÃO HELPER — retorna role do usuário logado
-- ============================================================
create or replace function get_my_role()
returns user_role language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
alter table profiles enable row level security;

create policy "profiles: leitura autenticada" on profiles
  for select using (auth.uid() is not null);

create policy "profiles: admin gerencia todos" on profiles
  for all using (get_my_role() = 'admin');

create policy "profiles: dono gerencia lider e consultor" on profiles
  for all using (
    get_my_role() = 'dono'
    and role in ('lider', 'consultor')
  );

create policy "profiles: usuário atualiza o próprio" on profiles
  for update using (id = auth.uid());

-- PILLAR_CONFIG
alter table pillar_config enable row level security;

create policy "pillar_config: todos leem" on pillar_config
  for select using (auth.uid() is not null);

create policy "pillar_config: admin e dono editam" on pillar_config
  for all using (get_my_role() in ('admin', 'dono'));

-- SCORE_UPLOADS
alter table score_uploads enable row level security;

create policy "uploads: admin e dono inserem" on score_uploads
  for insert with check (get_my_role() in ('admin', 'dono'));

create policy "uploads: admin, dono e lider leem tudo" on score_uploads
  for select using (get_my_role() in ('admin', 'dono', 'lider'));

create policy "uploads: consultor lê (para acessar próprios resultados)" on score_uploads
  for select using (get_my_role() = 'consultor');

-- SCORE_CONSULTOR_RESULTADOS
alter table score_consultor_resultados enable row level security;

create policy "resultados: admin, dono e lider leem tudo" on score_consultor_resultados
  for select using (get_my_role() in ('admin', 'dono', 'lider'));

create policy "resultados: consultor lê apenas os próprios" on score_consultor_resultados
  for select using (
    get_my_role() = 'consultor'
    and id_carteira = (select id_carteira from profiles where id = auth.uid())
  );

create policy "resultados: inserção via upload (admin e dono)" on score_consultor_resultados
  for insert with check (get_my_role() in ('admin', 'dono'));
