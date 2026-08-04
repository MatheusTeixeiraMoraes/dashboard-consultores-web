-- ============================================================================
-- Rota Inter/Hexa Recife — categoria TEMPORÁRIA
--
-- Base própria, separada de `clientes` DE PROPÓSITO. Três motivos concretos:
--
--   1. 24 dos 145 clientes da planilha estão marcados "Não (fora da planilha
--      geral)". Se entrassem em `clientes`, o próximo import da Planilha Geral
--      chamaria reconciliar_carteira e esconderia justamente esses 24 — a
--      categoria perderia um sexto da base sozinha, em silêncio.
--   2. 13 têm "Consultor confere? NÃO — divergente". Em `clientes`, a
--      reconciliação transferiria esses clientes de dono conforme a Planilha
--      Geral, desfazendo a atribuição desta rota.
--   3. Categoria temporária tem que sair inteira quando acabar. Aqui é um
--      `drop table` (mais o delete das rotas com origem 'hexa_recife', abaixo);
--      dentro de `clientes` seria arqueologia para separar o que era Hexa.
--
-- Fonte: "Planilha Aprovados Compilada Hexa.xlsx" (1 aba, 27 colunas, 145
-- linhas com conteúdo). Snapshot: reimportar SUBSTITUI a base inteira.
--
-- Rodar no SQL Editor do Supabase.
--
-- É re-executável (create table if not exists + drop policy antes de create).
-- `create policy` NÃO aceita `if not exists` e o erro 42710 aborta o script
-- inteiro — armadilha já paga duas vezes neste repo.
-- ============================================================================

begin;

create table if not exists hexa_recife_clientes (
  id                 uuid primary key default gen_random_uuid(),

  -- Chave do snapshot. A planilha traz 145 seller_id distintos; repetido
  -- significa arquivo errado (dois recortes colados) e o unique recusa.
  seller_id          text not null unique,

  -- --- Lado "planilha" (o que veio da originação) ---
  documento          text not null default '',
  documento_tipo     text not null default '',   -- coluna "Tipo": CNPJ | CPF
  nome_comercio      text not null default '',
  tpv                numeric,                    -- "R$ 231.056,66" vira número no import
  cnae               text not null default '',
  mcc                text not null default '',
  regiao             text not null default '',
  consultor_planilha text not null default '',
  status_operacional text not null default '',   -- Pendente Número Lógico | Aguardando Ativação | Pendente Dados | Pendente Ajuste
  casou_por          text not null default '',

  -- --- Lado "dashboard" (o cadastro que já existe do cliente) ---
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

  -- Dono do cliente NESTA rota. É por NOME, como em `clientes` e `rotas` — é
  -- assim que a planilha entrega e é o que a RLS compara. Vem da coluna
  -- "Consultor (dashboard)", que é a que casa com profiles.nome.
  consultor_nome     text not null default '',

  -- --- Conferências que a planilha já traz prontas ---
  consultor_confere  boolean not null default true,   -- "Consultor confere?"
  status_cadastro    text not null default '',        -- Cliente Atualizado | Cliente não atualizado
  em_carteira        boolean not null default true,   -- "Está na carteira?"
  cadastro_completo  boolean not null default true,   -- "Cadastro completo?"
  campos_faltando    text not null default '',

  importado_em       timestamptz not null default now(),
  importado_por      uuid references profiles(id),
  updated_at         timestamptz not null default now()
);

-- Índice de nome: a RLS de consultor compara nome_normalizado(consultor_nome).
-- Com 145 linhas nada disso é gargalo — está aqui por consistência com
-- `clientes`, e porque custa nada numa tabela deste tamanho.
create index if not exists hexa_recife_consultor_idx on hexa_recife_clientes(lower(consultor_nome));
create index if not exists hexa_recife_cidade_idx    on hexa_recife_clientes(cidade);

alter table hexa_recife_clientes enable row level security;

-- ----------------------------------------------------------------------------
-- RLS
--
-- Leitura: gestão vê os 145; consultor vê só os do nome dele — mesma regra de
-- `clientes`, escrita na forma de 2026-07-31_rls_sem_funcao_opaca.sql
-- (`(select get_my_role())` e `(select meu_nome_norm())` viram InitPlan, uma
-- avaliação por consulta em vez de uma por linha).
--
-- Escrita: SÓ admin. Foi a decisão do dono — a planilha é gerida pela
-- administração e a base espelha o arquivo. Nem dono nem líder escrevem aqui,
-- ao contrário das outras planilhas (que aceitam admin e dono). Isso vale
-- também para o delete, que é o que o import usa antes de regravar o snapshot:
-- sem a policy de delete o import falharia EM SILÊNCIO (RLS não devolve erro,
-- apaga zero linhas) e a base duplicaria.
-- ----------------------------------------------------------------------------
drop policy if exists "hexa: admin, dono e lider leem tudo" on hexa_recife_clientes;
create policy "hexa: admin, dono e lider leem tudo" on hexa_recife_clientes
  for select using ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "hexa: consultor lê os seus (por nome)" on hexa_recife_clientes;
create policy "hexa: consultor lê os seus (por nome)" on hexa_recife_clientes
  for select using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "hexa: só admin importa" on hexa_recife_clientes;
create policy "hexa: só admin importa" on hexa_recife_clientes
  for insert with check ((select get_my_role()) = 'admin');

drop policy if exists "hexa: só admin atualiza" on hexa_recife_clientes;
create policy "hexa: só admin atualiza" on hexa_recife_clientes
  for update using ((select get_my_role()) = 'admin');

drop policy if exists "hexa: só admin apaga" on hexa_recife_clientes;
create policy "hexa: só admin apaga" on hexa_recife_clientes
  for delete using ((select get_my_role()) = 'admin');


-- ============================================================================
-- `rotas.origem` — de onde veio a rota.
--
-- As rotas da Hexa vão para a MESMA tabela `rotas`, e não para uma tabela
-- própria: assim o consultor continua com UMA agenda só, e Refazer/Renomear/
-- Excluir/KPIs já prontos valem para elas sem duplicar tela nenhuma.
--
-- Coluna com default: as rotas existentes viram 'carteira' sem migração de
-- dados, e nenhuma tela atual precisa mudar para continuar funcionando.
-- Encerrar a categoria = delete from rotas where origem = 'hexa_recife'.
--
-- Sem índice em `origem`: a tabela tem dezenas de linhas e as duas únicas
-- consultas por origem são o selo (já traz a coluna no select) e o delete do
-- encerramento. Índice aqui só pesaria na escrita.
-- ============================================================================
alter table rotas add column if not exists origem text not null default 'carteira';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rotas_origem_valida') then
    alter table rotas add constraint rotas_origem_valida
      check (origem in ('carteira', 'hexa_recife'));
  end if;
end $$;

commit;


-- ============================================================================
-- CONFERÊNCIA depois de rodar (não declarar pronto sem isto)
--
-- 1. As 5 policies existem e a tabela está com RLS ligada:
--      select policyname, cmd from pg_policies
--       where schemaname = 'public' and tablename = 'hexa_recife_clientes';
--      select relrowsecurity from pg_class where relname = 'hexa_recife_clientes';
--
-- 2. A coluna nova não quebrou a agenda: toda rota antiga é 'carteira'.
--      select origem, count(*) from rotas group by origem;
--
-- 3. PROVA DE ISOLAMENTO (a que importa): logado como consultor de teste, ver
--    APENAS os clientes Hexa com o nome dele, e não conseguir importar nem
--    apagar. Usar ALVO FICTÍCIO — o banco é o de produção.
--
-- ----------------------------------------------------------------------------
-- PARA ENCERRAR A CATEGORIA (quando a rota Inter/Hexa acabar):
--
--   delete from rotas where origem = 'hexa_recife';
--   drop table hexa_recife_clientes;
--   -- e remover a seção do Sidebar + a pasta src/app/(dashboard)/dashboard/hexa-recife
--
-- A coluna `rotas.origem` pode ficar: é inofensiva e o default cobre todo mundo.
-- ============================================================================
