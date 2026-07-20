-- ============================================================
-- Campanhas — a "Planilha Geral" que o Mercado Pago manda todo mês.
--
-- É um SNAPSHOT da carteira: o que o MP mandou fazer com cada cliente
-- (os "acionáveis"), com prioridade e contexto de abordagem.
--
-- PROPOSITALMENTE SEPARADO DE `clientes`:
--   `clientes`  = cadastro editável, endereço e GPS, serve para gerar ROTAS
--                 (Radar/Roteirizar). Tem `status_atualizacao` justamente para
--                 proteger a edição manual contra sobrescrita de import.
--   `mp_*`      = snapshot descartável, trocado a cada planilha nova.
-- O import destas tabelas NUNCA escreve em `clientes`. A tela de Campanhas só
-- CONSULTA nome/telefone por seller_id na hora de exibir a fila — leitura, não
-- fusão. Misturar as duas naturezas obrigaria cada import mensal a decidir
-- campo a campo o que sobrescrever, e é assim que se perde edição manual.
--
-- Duas tabelas em vez de uma linha "explodida": um cliente tem de 1 a 6
-- acionáveis, e guardar tudo numa tabela só faria toda contagem por cliente
-- (quantos em CHURN, quanto de TPV) contar o mesmo cliente até 6 vezes. Erro
-- silencioso e caro num painel cujo trabalho é espelhar número certo.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- 1. Snapshot por cliente (3.077 linhas por planilha)
-- ============================================================
create table if not exists mp_carteira (
  id                uuid primary key default gen_random_uuid(),

  -- Data da planilha (o "13.07" do nome do arquivo). Guardamos o histórico:
  -- comparar o mês que vem com este é o que mostra se a fila andou.
  data_referencia   date not null,

  -- A planilha identifica o cliente SÓ por isto. Não vem nome, telefone,
  -- endereço nem documento — é text porque o MP usa IDs longos.
  seller_id         text not null,

  -- Vínculo com o consultor é por NOME, igual ao resto do app (ver
  -- cliente_e_meu). O nome vem da planilha, que é a fonte da verdade aqui.
  consultor_nome    text not null,

  status            text,          -- ATIVO | CHURN | INATIVO | REATIVADO
  quartil           text,          -- P1..P4
  prio              integer,       -- ranking fino dentro do quartil (1..449)

  -- TPV como a planilha manda. ATENÇÃO ao ler: a planilha é tirada no meio do
  -- mês, então tpv_mes_atual é PARCIAL. Comparar direto com o mês passado
  -- (fechado) sugere uma queda que não existe.
  tpv_mes_atual     numeric,
  tpv_mes_passado   numeric,

  status_credito    text,
  mcc               text,          -- segmento do comércio
  recorrencia       text,
  ultimo_contato    date,          -- null = nunca contatado (11% da base)
  pesquisa_recente  date,

  multicontas       integer,
  tpv_outras_contas numeric,

  -- Oportunidade de "limpeza de balcão": valor em jogo, quanto já foi atingido
  -- (0..1) e se já reverteu. Vem pronto do MP — não calculamos nada.
  oportunidade_1x   boolean not null default false,
  valor_1x          numeric,
  ating_1x          numeric,
  revertido_1x      boolean not null default false,
  oportunidade_parc boolean not null default false,
  valor_parc        numeric,
  ating_parc        numeric,
  revertido_parc    boolean not null default false,

  qtd_acionaveis    integer not null default 0,
  created_at        timestamptz not null default now(),

  -- Um cliente aparece uma única vez por planilha. Se estourar, o arquivo tem
  -- dois meses colados — o parser também barra isso antes de chegar aqui.
  unique (data_referencia, seller_id)
);

-- ============================================================
-- 2. Acionáveis (5.248 linhas por planilha)
--
-- A coluna "LISTA ACIONÁVEIS COMERCIAIS" é multivalorada; aqui ela vira uma
-- linha por par cliente x ação. É a única transformação estrutural do import,
-- e não é cálculo: é normalização.
-- ============================================================
create table if not exists mp_acionaveis (
  id              uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  seller_id       text not null,
  consultor_nome  text not null,   -- repetido de propósito: a fila filtra por
                                   -- consultor sem precisar de join
  acionavel       text not null,   -- "Limpeza de balcão 1x", "Aumentar TPV", ...
  created_at      timestamptz not null default now(),

  unique (data_referencia, seller_id, acionavel)
);

-- ============================================================
-- 3. Índices — os três caminhos que a tela realmente percorre
-- ============================================================
-- "a fila da campanha X do consultor Y", que é a consulta principal
create index if not exists idx_mp_acionaveis_fila
  on mp_acionaveis (data_referencia, acionavel, consultor_nome);
-- "todos os acionáveis deste cliente" (o selo "+N acionáveis")
create index if not exists idx_mp_acionaveis_seller
  on mp_acionaveis (data_referencia, seller_id);
-- "a carteira do consultor, na ordem de prioridade do MP"
create index if not exists idx_mp_carteira_consultor
  on mp_carteira (data_referencia, consultor_nome, prio);
create index if not exists idx_mp_carteira_seller
  on mp_carteira (data_referencia, seller_id);

-- ============================================================
-- 4. RLS — mesma regra do resto do app, na MESMA migration
--
-- Reusa get_my_role() e cliente_e_meu() de 2026-07-15_clientes_carteira.sql.
-- cliente_e_meu compara com unaccent+lower+trim, então acento e caixa não
-- quebram o vínculo. O que ele NÃO resolve é nome truncado: se o profile de um
-- consultor não bater com o nome que vem na planilha, ele abre a tela vazia e
-- sem erro nenhum. Por isso o import mostra quais nomes não casaram.
-- ============================================================
alter table mp_carteira   enable row level security;
alter table mp_acionaveis enable row level security;

drop policy if exists "mp_carteira: gestao le tudo" on mp_carteira;
create policy "mp_carteira: gestao le tudo" on mp_carteira
  for select using (get_my_role() in ('admin', 'dono', 'lider'));

drop policy if exists "mp_carteira: consultor le a sua" on mp_carteira;
create policy "mp_carteira: consultor le a sua" on mp_carteira
  for select using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

drop policy if exists "mp_carteira: gestao importa" on mp_carteira;
create policy "mp_carteira: gestao importa" on mp_carteira
  for insert with check (get_my_role() in ('admin', 'dono'));

-- Sem a policy de delete o import falha EM SILÊNCIO: o RLS não devolve erro,
-- apenas apaga zero linhas — e aí o snapshot antigo continua lá, duplicando
-- tudo na tela. Já aconteceu neste projeto.
drop policy if exists "mp_carteira: gestao apaga" on mp_carteira;
create policy "mp_carteira: gestao apaga" on mp_carteira
  for delete using (get_my_role() in ('admin', 'dono'));

drop policy if exists "mp_acionaveis: gestao le tudo" on mp_acionaveis;
create policy "mp_acionaveis: gestao le tudo" on mp_acionaveis
  for select using (get_my_role() in ('admin', 'dono', 'lider'));

drop policy if exists "mp_acionaveis: consultor le a sua" on mp_acionaveis;
create policy "mp_acionaveis: consultor le a sua" on mp_acionaveis
  for select using (get_my_role() = 'consultor' and cliente_e_meu(consultor_nome));

drop policy if exists "mp_acionaveis: gestao importa" on mp_acionaveis;
create policy "mp_acionaveis: gestao importa" on mp_acionaveis
  for insert with check (get_my_role() in ('admin', 'dono'));

drop policy if exists "mp_acionaveis: gestao apaga" on mp_acionaveis;
create policy "mp_acionaveis: gestao apaga" on mp_acionaveis
  for delete using (get_my_role() in ('admin', 'dono'));
