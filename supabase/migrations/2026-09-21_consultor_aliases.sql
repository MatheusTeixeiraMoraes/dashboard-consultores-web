-- ============================================================================
-- consultor_aliases: mesma pessoa, grafias diferentes entre as duas planilhas.
--
-- A pontuação (score_consultor_resultados) traz nome + id_carteira estável
-- (vem da coluna "ID Carteira" da planilha). A carteira (clientes/mp_carteira,
-- vindas da Planilha Geral) só traz nome — essa planilha não tem coluna de id
-- de consultor. Enquanto as duas fontes escreverem o nome do mesmo jeito, o
-- merge por nome normalizado em GeralPage (src/app/(dashboard)/dashboard/
-- page.tsx) casa as duas pontas. Quando uma das fontes muda o formato do nome
-- (caso real: pontuação passou a trazer "RIVALDO BATISTA SILVA DOS SANTOS",
-- carteira continua com "RIVALDO BATISTA"), o merge para de casar e o
-- consultor aparece DUPLICADO — uma linha com score e sem carteira, outra com
-- carteira e sem score.
--
-- Esta tabela deixa um admin/dono registrar manualmente "esta grafia é este
-- id_carteira" quando isso acontecer de novo. Não dá para fundir sozinho por
-- prefixo/fuzzy match: é o mesmo argumento já documentado em
-- listarConsultoresDaPlanilha (src/app/(dashboard)/dashboard/usuarios/
-- convites.ts) para não adivinhar grafias que compartilham carteira — risco
-- de sobrenome composto ou homônimo parcial.
-- ============================================================================

create table consultor_aliases (
  nome_normalizado text primary key,
  id_carteira text not null,
  nome_variante text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references profiles(id)
);

alter table consultor_aliases enable row level security;

-- Leitura: qualquer usuário ativo. GeralPage roda a MESMA busca para gestão e
-- consultor (o RLS de score/clientes/carteira já restringe cada um à própria
-- linha) — o mapa de aliases em si não é dado sensível de cliente.
create policy "consultor_aliases: usuário ativo lê" on consultor_aliases
  for select using ((select get_my_role()) is not null);

create policy "consultor_aliases: admin e dono gerenciam" on consultor_aliases
  for all using ((select get_my_role()) in ('admin', 'dono'));

-- Seed do caso relatado em 21/09/2026.
insert into consultor_aliases (nome_normalizado, id_carteira, nome_variante)
values ('rivaldo batista', '2244376330', 'RIVALDO BATISTA');
