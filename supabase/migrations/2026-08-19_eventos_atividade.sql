-- ============================================================
-- Log de atividade para administradores.
--
-- Não existia nenhum registro geral de "quem fez o quê e quando". A única
-- trilha parecida, `acessos_delegados`, grava certo mas nunca virou tela —
-- só `.insert`/`.update`, nunca `.select()` em nenhuma página. Esta tabela
-- é o feed unificado: login, edição de cliente, ações administrativas
-- (usuários/papéis/metas) e a própria delegação passam a alimentar aqui.
--
-- MESMO PADRÃO DE SEGURANÇA de `acessos_delegados`, de propósito:
--   - Nomes do ator CONGELADOS em texto — sobrevive a perfil apagado.
--   - RLS só de LEITURA para admin/dono.
--   - NENHUMA policy de escrita + revoke explícito: quem grava é sempre o
--     servidor com service_role, dentro de código que já validou o papel
--     (ver src/lib/atividade.ts). Um insert liberado pro navegador é
--     exatamente o furo que já aconteceu em `convites_acesso` — não repetir.
--
-- Idempotente.
-- ============================================================

create table if not exists eventos_atividade (
  id              uuid primary key default gen_random_uuid(),

  -- 'login' | 'cliente_criado' | 'cliente_editado' | 'cliente_removido_carteira'
  -- | 'usuario_criado' | 'usuario_excluido' | 'usuario_papel_alterado'
  -- | 'usuario_ativo_alterado' | 'meta_alterada' | 'delegacao_iniciada'
  -- | 'delegacao_encerrada' — texto livre de propósito, novo tipo não pede migration.
  tipo            text not null,

  ator_id         uuid references profiles(id) on delete set null,
  ator_nome       text not null,
  ator_email      text not null,

  -- O que foi afetado. `alvo_id` é sempre texto (seller_id, profile id,
  -- pilar_key variam de tipo) e `alvo_descricao` é o nome legível congelado
  -- na hora — não depende de join nem sobrevive só enquanto o alvo existir.
  alvo_tipo       text,
  alvo_id         text,
  alvo_descricao  text,

  -- Payload livre por tipo de evento (ex.: {"de":"consultor","para":"lider"}).
  detalhes        jsonb,

  criado_em       timestamptz not null default now()
);

create index if not exists eventos_atividade_criado_idx on eventos_atividade (criado_em desc);
create index if not exists eventos_atividade_ator_idx   on eventos_atividade (ator_id);
create index if not exists eventos_atividade_tipo_idx   on eventos_atividade (tipo);

alter table eventos_atividade enable row level security;

drop policy if exists "eventos_atividade: admin e dono leem" on eventos_atividade;
create policy "eventos_atividade: admin e dono leem" on eventos_atividade
  for select using (get_my_role() in ('admin', 'dono'));

revoke insert, update, delete on eventos_atividade from anon, authenticated;
