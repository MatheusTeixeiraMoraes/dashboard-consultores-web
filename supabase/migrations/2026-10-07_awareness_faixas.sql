-- ============================================================
-- Awareness: meta por QUANTIDADE de respostas, por tamanho da carteira ativa.
--
-- Regra do MP desde 05/10/2026 (Bloco 1 — Atuação): a pesquisa deixou de ser
-- "% Awareness" em degraus e virou tudo-ou-nada contra uma quantidade fixa de
-- sellers que responderam, que varia com o tamanho da carteira ATIVA do
-- consultor (ATIVO + REATIVADO na Planilha Ação Oportunidades; CHURN e INATIVO
-- ficam de fora). Abaixo do piso (40 respostas) o Bloco 1 inteiro zera.
--
-- Conferido contra os 10 consultores reais em 05 e 06/10/2026: a nota da
-- planilha (SCORE pesquisa, 0 ou 1,5) bate com esta regra nos 20 casos.
--
-- As faixas mudam quando o MP quiser, então são editáveis em /dashboard/metas
-- sem deploy -- mesmo molde e mesmo padrão de permissão de
-- metas_acionaveis_faixas (qualquer ativo lê, só admin/dono edita).
--
-- O piso é uma coluna nova em pillar_config, e NÃO a coluna `meta` do
-- Awareness: `meta` (47,5%, regra antiga) continua intacta, então esta migration
-- não muda nada no app que está no ar antes do deploy do código novo.
--
-- Idempotente.
--
-- Aplicada em 07/10/2026 pelo MCP (apply_migration) SEM os dois `drop policy if
-- exists` abaixo: o servidor pede confirmação humana para qualquer DROP e a
-- sessão não consegue exibi-la (a chamada volta {"status":"declined"}). Numa
-- tabela recém-criada o efeito é idêntico; os `drop` ficam aqui só para o
-- arquivo poder ser reexecutado sem erro.
-- ============================================================

create table if not exists metas_awareness_faixas (
  id              uuid primary key default gen_random_uuid(),
  -- A partir de quantos sellers ATIVOS na carteira esta faixa vale.
  min_carteira    integer not null unique check (min_carteira > 0),
  -- Respostas de pesquisa que o consultor precisa ter pra levar a nota cheia.
  meta_respostas  integer not null check (meta_respostas > 0),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null
);

alter table metas_awareness_faixas enable row level security;

drop policy if exists "metas_awareness_faixas: usuário ativo lê" on metas_awareness_faixas;
create policy "metas_awareness_faixas: usuário ativo lê" on metas_awareness_faixas
  for select using (get_my_role() is not null);

drop policy if exists "metas_awareness_faixas: admin e dono editam" on metas_awareness_faixas;
create policy "metas_awareness_faixas: admin e dono editam" on metas_awareness_faixas
  for all using (get_my_role() in ('admin', 'dono'));

-- Faixas vigentes em 05/10/2026 (slide "Bloco 1 — Atuação" do MP).
insert into metas_awareness_faixas (min_carteira, meta_respostas) values
  (1, 40), (101, 40), (201, 80), (301, 120), (401, 120), (501, 120)
on conflict (min_carteira) do nothing;

-- Piso mínimo obrigatório: abaixo dele o Bloco 1 inteiro zera. Só o Awareness usa.
alter table pillar_config add column if not exists piso_minimo numeric check (piso_minimo > 0);
update pillar_config set piso_minimo = 40 where pilar_key = 'awareness' and piso_minimo is null;
