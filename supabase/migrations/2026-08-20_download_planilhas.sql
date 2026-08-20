-- ============================================================
-- Download do arquivo original de cada planilha enviada.
--
-- Até aqui o app só guardava os DADOS extraídos (score_consultor_resultados,
-- mp_carteira, mp_acionaveis) — o .xlsx/.csv em si nunca era salvo em lugar
-- nenhum. Envios ANTERIORES a esta migration não têm arquivo pra recuperar
-- (arquivo_path fica null neles, de propósito — decisão explícita do usuário
-- de não tentar reconstruir um substituto).
--
-- Bucket PRIVADO: nada de link público. Toda leitura passa por signed URL
-- gerada sob demanda (createSignedUrl), pedida só na hora do clique em
-- "Baixar" — mesmo espírito de nunca expor dado sensível direto.
--
-- Idempotente.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('planilhas-upload', 'planilhas-upload', false)
on conflict (id) do nothing;

drop policy if exists "planilhas-upload: admin e dono leem" on storage.objects;
create policy "planilhas-upload: admin e dono leem" on storage.objects
  for select using (bucket_id = 'planilhas-upload' and get_my_role() in ('admin', 'dono'));

drop policy if exists "planilhas-upload: admin e dono inserem" on storage.objects;
create policy "planilhas-upload: admin e dono inserem" on storage.objects
  for insert with check (bucket_id = 'planilhas-upload' and get_my_role() in ('admin', 'dono'));

drop policy if exists "planilhas-upload: admin e dono apagam" on storage.objects;
create policy "planilhas-upload: admin e dono apagam" on storage.objects
  for delete using (bucket_id = 'planilhas-upload' and get_my_role() in ('admin', 'dono'));

-- score_uploads ganha o caminho do arquivo original.
alter table score_uploads add column if not exists arquivo_path text;

-- ============================================================
-- Histórico da "Planilha Ação Oportunidades" (mp_carteira + mp_acionaveis).
-- Não existia NENHUM registro por envio antes disso — só o snapshot vivo
-- nas tabelas de destino, sem rastro de quem/quando enviou cada versão.
-- Mesmo padrão de score_uploads: uploaded_by por FK (join ao vivo em
-- profiles, não congelado — mesma convenção da tabela irmã nesta tela).
-- ============================================================
create table if not exists carteira_uploads (
  id               uuid primary key default gen_random_uuid(),
  uploaded_by      uuid not null references profiles(id),
  filename         text not null,
  arquivo_path     text,
  data_referencia  date not null,
  total_clientes   integer not null,
  total_acionaveis integer not null,
  created_at       timestamptz not null default now()
);

alter table carteira_uploads enable row level security;

drop policy if exists "carteira_uploads: admin e dono leem" on carteira_uploads;
create policy "carteira_uploads: admin e dono leem" on carteira_uploads
  for select using (get_my_role() in ('admin', 'dono'));

drop policy if exists "carteira_uploads: admin e dono inserem" on carteira_uploads;
create policy "carteira_uploads: admin e dono inserem" on carteira_uploads
  for insert with check (get_my_role() in ('admin', 'dono'));
