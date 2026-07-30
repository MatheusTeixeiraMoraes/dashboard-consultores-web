-- ============================================================
-- SCHEMA PARCIAL — dashboard de consultores
--
-- ⚠ ESTE ARQUIVO NÃO É MAIS A FONTE DA VERDADE. A fonte é
--   supabase/migrations/, na ordem cronológica do nome.
--
-- Ele parou de ser sincronizado em 15/07/2026 e NÃO contém, entre outras
-- coisas: as tabelas `mp_carteira`, `mp_acionaveis` e `convites_acesso`, a
-- coluna `clientes.em_carteira`, as funções `reconciliar_carteira`,
-- `nome_normalizado` e `profiles_impede_autopromocao`, nem o trigger que
-- impede autopromoção.
--
-- POR QUE NÃO FOI SIMPLESMENTE ATUALIZADO: reconstruir aqui, de memória, três
-- tabelas que só existem no banco é como o arquivo passa a MENTIR com cara de
-- verdade. Um schema parcial e declarado é menos perigoso que um schema
-- completo e errado. Se um dia isto voltar a ser um retrato fiel, gere com
-- `pg_dump --schema-only` a partir do banco — não à mão.
--
-- As policies de `profiles` abaixo JÁ FORAM CORRIGIDAS aqui, porque deixá-las
-- na versão antiga era o único trecho com risco ativo: recriar um ambiente a
-- partir deste arquivo ressuscitaria duas escaladas de privilégio confirmadas
-- em produção em 30/07/2026 (qualquer consultor virava admin; qualquer conta
-- logada lia o diretório inteiro da empresa).
--
-- Os `drop table` abaixo APAGAM TODOS OS DADOS. Não rode isto num banco em uso.
--
-- Última sincronização real com produção: 15/07/2026
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
-- Estende auth.users com role, nome e id_carteira.
--
-- NÃO existe trigger em auth.users criando o profile. Já existiu
-- (on_auth_user_created -> handle_new_user) e foi removido: quando esse trigger
-- falha, o Supabase aborta a criação do usuário com "Database error creating
-- new user" e nenhuma pista do motivo. Hoje quem cria o profile é a rota
-- /api/usuarios/criar, que insere depois do usuário e faz rollback se falhar.
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

-- ============================================================
-- 3. CONFIGURAÇÃO DOS PILARES (metas editáveis pela tela)
--
-- A meta NÃO calcula o score. O score vem pronto da planilha do Mercado Pago
-- (coluna SCORE de cada pilar) e a curva de pontuação deles não é linear, então
-- não é reproduzível. A meta serve só para o selo "Meta atingida" e o "Faltam X".
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

-- Metas vigentes em 13/07/2026. São editáveis em /dashboard/metas.
-- net_churn: negativo = encolheu a carteira, então maior é melhor (tipo_comp 'ge').
insert into pillar_config (pilar_key, label, categoria, meta, pontos_max, unidade, tipo_comp) values
  ('awareness',      'Awareness',              'atuacao',   47.5,  1.5, '%',     'ge'),
  ('produtividade',  'Produtividade',           'atuacao',    6.0,  0.5, 'numero','ge'),
  ('aderencia',      'Aderência a Agenda',      'atuacao',   60.0,  1.0, '%',     'ge'),
  ('net_churn',      'Net Churn',               'resultado', -1.5,  3.0, '%',     'ge'),
  ('tpv',            'TPV',                     'resultado', 106.0, 1.0, '%',     'ge'),
  ('acionaveis',     'Acionáveis Comerciais',   'resultado',  22.4, 3.0, '%',     'ge');

-- ============================================================
-- 4. UPLOADS DE PLANILHA
--
-- Um upload = uma planilha de um pilar numa data de referência.
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
  uploaded_at      timestamptz not null default now(),

  -- Impede dois lotes do mesmo pilar na mesma data.
  -- O app apaga o lote anterior antes de reenviar, então em uso normal isto
  -- nunca dispara. Existe para o caso anormal: um cliente desatualizado (aba
  -- velha, deploy antigo) que insere sem apagar. Sem esta trava, ele empilha um
  -- segundo lote em silêncio e as telas passam a somar dados repetidos.
  constraint score_uploads_pilar_data_unico unique (pilar_key, data_referencia)
);

-- ============================================================
-- 5. RESULTADOS POR CONSULTOR
--
-- `metricas` guarda as colunas da planilha como vieram (chaves = cabeçalhos
-- exatos do .xlsx, ver src/lib/pilares.ts), com os percentuais já na escala
-- 0–100. A normalização acontece uma única vez, no upload: as telas só formatam.
-- ============================================================
create table score_consultor_resultados (
  id               uuid primary key default gen_random_uuid(),
  upload_id        uuid not null references score_uploads(id) on delete cascade,
  id_carteira      text not null,
  consultor_nome   text not null,
  pilar_key        text not null,
  valor_metrica    numeric not null,
  score_planilha   numeric not null default 0,
  metricas         jsonb,
  mes_referencia   date,
  data_referencia  date,

  -- Legado: vinha da coluna "Total a Reverter", que não existe mais nas
  -- planilhas do MP. Nenhum código lê. Mantida só para não perder histórico.
  total_a_reverter numeric
);

create index on score_consultor_resultados(upload_id);
create index on score_consultor_resultados(id_carteira);
create index on score_consultor_resultados(pilar_key);
create index on score_consultor_resultados(mes_referencia);
create index on score_consultor_resultados(data_referencia);

-- ============================================================
-- 6. FUNÇÃO HELPER — role do usuário logado
--
-- `and ativo` é o gate de revogação: desativar um perfil faz esta função
-- devolver null, e como quase toda policy do banco deriva daqui, o acesso cai
-- inteiro de uma vez. Ver 2026-07-30_revogacao_e_chave_de_nome.sql — inclusive
-- a armadilha de `NULL not in (...)` que isso cria em guards de função.
-- `set search_path` porque é security definer.
-- ============================================================
create or replace function get_my_role()
returns user_role language sql security definer stable
set search_path = public as $$
  select role from profiles where id = auth.uid() and ativo;
$$;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
alter table profiles enable row level security;

-- CORRIGIDA em 30/07/2026. Era `using (auth.uid() is not null)`, o que
-- entregava nome, e-mail, papel e carteira de TODO MUNDO para qualquer conta
-- logada — e o cadastro público do Supabase estava ligado, então bastava um
-- estranho se cadastrar para ler o diretório da empresa.
-- O ramo `id = auth.uid()` é necessário: é ele que permite ao app ler a própria
-- linha e avisar "seu acesso foi desativado" em vez de um laço mudo de login.
create policy "profiles: cada um le o seu; gestao le todos" on profiles
  for select using (
    id = auth.uid()
    or get_my_role() in ('admin', 'dono', 'lider')
  );

create policy "profiles: admin gerencia todos" on profiles
  for all using (get_my_role() = 'admin');

create policy "profiles: dono gerencia lider e consultor" on profiles
  for all using (
    get_my_role() = 'dono'
    and role in ('lider', 'consultor')
  );

-- ATENÇÃO: esta policy diz QUAL LINHA, nunca QUAIS COLUNAS. Sozinha, ela deixa
-- o dono da linha reescrever o próprio `role` e virar admin — confirmado em
-- produção. Quem fecha isso é o trigger `profiles_impede_autopromocao`, que NÃO
-- está neste arquivo: veja 2026-07-30_profiles_trava_autopromocao.sql. Recriar o
-- banco só com este schema deixa o furo aberto.
create policy "profiles: usuário atualiza o próprio" on profiles
  for update using (id = auth.uid());

-- PILLAR_CONFIG
alter table pillar_config enable row level security;

-- `get_my_role() is not null` e não `auth.uid() is not null`: era a única policy
-- que não passava por get_my_role(), então um usuário DESATIVADO continuaria
-- lendo as metas da empresa mesmo com o acesso revogado.
create policy "pillar_config: usuário ativo lê" on pillar_config
  for select using (get_my_role() is not null);

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

-- Sem esta policy o upsert do upload falha EM SILÊNCIO: o RLS não devolve erro,
-- só apaga zero linhas — e o lote antigo continua no banco, duplicando.
create policy "uploads: admin e dono apagam" on score_uploads
  for delete using (get_my_role() in ('admin', 'dono'));

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

create policy "resultados: admin e dono apagam" on score_consultor_resultados
  for delete using (get_my_role() in ('admin', 'dono'));

-- ============================================================
-- 8. CLIENTES (módulo Smart Routes / Radar)
--
-- Vínculo com o consultor por NOME (consultor_nome), não por id_carteira — é
-- assim que a planilha de origem entrega. RLS escopa por esse nome (sem acento,
-- minúsculo); admin/dono/líder veem tudo. Detalhes na migration
-- supabase/migrations/2026-07-15_clientes_carteira.sql.
-- ============================================================
create extension if not exists unaccent;

create table clientes (
  id                 uuid primary key default gen_random_uuid(),
  consultor_nome     text not null default '',
  seller_id          text not null unique,
  seller_nome        text not null default '',
  seller_telefone    text,
  seller_email       text,
  doc_tipo           text check (doc_tipo in ('CPF', 'CNPJ')),
  cpf_cnpj           text,
  cidade             text not null default '',
  bairro             text not null default '',
  endereco_completo  text not null default '',
  lat                numeric,
  lng                numeric,
  status_atualizacao text not null default 'Cliente não atualizado'
                       check (status_atualizacao in ('Cliente não atualizado', 'Cliente Atualizado')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references profiles(id)
);

create index on clientes(lower(consultor_nome));
create index on clientes(cidade);
create index on clientes(bairro);
create index on clientes(lat, lng);

-- Casa o nome do cliente com o nome do consultor logado.
-- A normalização vive em `nome_normalizado()` (2026-07-30_revogacao_e_chave_de_nome.sql)
-- para que o índice único de nome e esta comparação de autorização não possam
-- divergir. `set search_path` porque é security definer — e sem ele o
-- `unaccent` resolveria o dicionário por um caminho que o chamador controla.
create or replace function nome_normalizado(txt text)
returns text language sql immutable
set search_path = public, extensions as $$
  select lower(unaccent(trim(coalesce(txt, ''))))
$$;

create or replace function cliente_e_meu(consultor_nome text)
returns boolean language sql security definer stable
set search_path = public, extensions as $$
  select nome_normalizado(consultor_nome)
       = nome_normalizado((select nome from profiles where id = auth.uid()))
$$;

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

-- ============================================================
-- 9. ROTAS (Smart Routes — Roteirizar e Agenda)
--
-- Rota = paradas ordenadas (clientes) + partida/chegada + distância/tempo.
-- Pertence ao consultor por nome (reusa cliente_e_meu). Detalhes na migration
-- supabase/migrations/2026-07-15_rotas.sql.
-- ============================================================
create table rotas (
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
  stops            jsonb not null default '[]'::jsonb,
  distancia_km     numeric,
  tempo_minutos    numeric,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id)
);

create index on rotas(lower(consultor_nome));
create index on rotas(data_visita);

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
