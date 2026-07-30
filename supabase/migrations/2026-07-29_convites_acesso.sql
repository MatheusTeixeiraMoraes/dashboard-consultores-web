-- ============================================================
-- Convite de acesso: link individual que já carrega o vínculo com a planilha.
--
-- O PROBLEMA QUE ISTO RESOLVE: um consultor só enxerga os dados dele quando
-- DUAS chaves batem — `profiles.nome` com `clientes.consultor_nome` (sem
-- acento, minúsculo, via cliente_e_meu) e `profiles.id_carteira` com
-- `score_consultor_resultados.id_carteira`. As duas eram digitadas à mão na
-- criação do usuário. Errar uma letra não dá erro nenhum: o consultor loga,
-- a RLS não casa linha alguma e ele vê a tela vazia, achando que o sistema
-- está quebrado. Aqui o gestor ESCOLHE o consultor numa lista tirada das
-- próprias planilhas, e o par nome+carteira viaja dentro do convite — ninguém
-- digita nada.
--
-- O TOKEN NUNCA É GRAVADO EM CLARO: guardamos só o sha256. Quem ler esta
-- tabela depois (dump, backup, log de query) não consegue remontar link nenhum.
-- Por isso não existe índice/consulta por token puro — a busca é pelo hash.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists convites_acesso (
  id             uuid primary key default gen_random_uuid(),

  -- sha256 do token em hex. `unique` também serve de trava: dois convites
  -- nunca compartilham token.
  token_hash     text not null unique,

  -- O vínculo com a planilha, resolvido no momento em que o link é gerado.
  -- É isto que o aceite copia para `profiles` — a razão de existir da tabela.
  consultor_nome text not null,
  id_carteira    text,

  role           user_role not null default 'consultor',

  criado_por     uuid references profiles(id),
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,

  -- Uso único. `usado_em` é preenchido numa UPDATE condicional (... where
  -- usado_em is null), que é o que impede duas pessoas de aceitarem o mesmo
  -- link ao mesmo tempo.
  usado_em       timestamptz,
  usado_por      uuid references profiles(id),

  revogado_em    timestamptz
);

-- A validação do aceite entra por aqui a cada abertura do link.
create index if not exists convites_acesso_token_idx on convites_acesso (token_hash);

-- Lista da tela de gestão: os pendentes primeiro, mais novos no topo.
create index if not exists convites_acesso_criado_idx on convites_acesso (criado_em desc);

alter table convites_acesso enable row level security;

-- Consultor não tem NENHUMA policy aqui: não lê, não cria, não altera. A
-- ausência é intencional — com RLS ligada e sem policy, a tabela é invisível
-- para ele.
--
-- O aceite do convite (rota pública, sem sessão) não passa por estas policies:
-- roda no servidor com service_role, que atravessa a RLS. Estas existem para a
-- tela de gestão listar e revogar.
create policy "convites: admin e dono leem" on convites_acesso
  for select using (get_my_role() in ('admin', 'dono'));

create policy "convites: admin e dono criam" on convites_acesso
  for insert with check (get_my_role() in ('admin', 'dono'));

create policy "convites: admin e dono revogam" on convites_acesso
  for update using (get_my_role() in ('admin', 'dono'));
