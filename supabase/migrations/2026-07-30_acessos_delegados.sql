-- ============================================================
-- Trilha de "entrar na conta de".
--
-- A gestão pode abrir o painel COMO um consultor, para ver exatamente o que ele
-- vê. A escrita fica liberada (decisão do produto), e é justamente por isso que
-- esta tabela existe: com escrita liberada, o banco grava as ações no nome do
-- consultor e, sem registro, nem quem fez consegue reconstruir depois o que foi
-- a gestão e o que foi a pessoa.
--
-- Os nomes são CONGELADOS em colunas de texto, não só referenciados: se o
-- perfil for excluído meses depois, o log tem que continuar legível. As FKs
-- viram null (mesmo motivo do convite — apagar usuário não pode ser bloqueado
-- por histórico).
--
-- Idempotente.
-- ============================================================

create table if not exists acessos_delegados (
  id            uuid primary key default gen_random_uuid(),

  admin_id      uuid references profiles(id) on delete set null,
  admin_nome    text not null,
  admin_email   text not null,

  alvo_id       uuid references profiles(id) on delete set null,
  alvo_nome     text not null,
  alvo_email    text not null,

  iniciado_em   timestamptz not null default now(),
  encerrado_em  timestamptz
);

create index if not exists acessos_delegados_iniciado_idx
  on acessos_delegados (iniciado_em desc);

-- Sessão aberta de um admin: usada para fechar a anterior quando ele entra
-- noutra conta sem ter voltado da primeira.
create index if not exists acessos_delegados_aberto_idx
  on acessos_delegados (admin_id) where encerrado_em is null;

alter table acessos_delegados enable row level security;

-- Leitura só para quem já enxerga a gestão. Consultor não tem policy nenhuma
-- aqui — não deve nem saber que a tabela existe.
--
-- O `drop` antes do `create` é o que torna este arquivo REALMENTE re-executável:
-- o Postgres não tem `create policy if not exists`, então sem ele a segunda
-- execução morre em 42710 e — pior — aborta tudo o que vem DEPOIS, inclusive o
-- REVOKE lá embaixo. Já aconteceu duas vezes neste projeto.
drop policy if exists "delegacao: admin e dono leem" on acessos_delegados;

create policy "delegacao: admin e dono leem" on acessos_delegados
  for select using (get_my_role() in ('admin', 'dono'));

-- NENHUMA policy de escrita, de propósito, e o REVOKE por cima: quem grava é
-- sempre o servidor com service_role, dentro da action que já checou o papel.
-- Foi exatamente o buraco de `convites_acesso` (policy de insert liberada para
-- o navegador) que permitiu forjar convite de admin — não repetir.
revoke insert, update, delete on acessos_delegados from anon, authenticated;
