-- ============================================================
-- Origem da coordenada do cliente (exata x aproximada)
--
-- POR QUE: `lat`/`lng` guardava dois dados diferentes com a mesma cara — o
-- ponto do estabelecimento e o CENTROIDE do bairro. Indistinguíveis na tela, e
-- a rota tratava os dois como porta do cliente. Na prática: 5 clientes de Terra
-- Firme/Belém dividiam o mesmo par de coordenadas, que caía em Nazaré, 5 km
-- fora, e a rota do dia mandava o consultor para lá. Na base inteira eram 934
-- clientes empilhados em 285 pontos.
--
-- A coluna separa os dois casos para que a tela possa avisar, em vez de o
-- consultor descobrir na porta errada.
--
--   'exata'      — veio do endereço com rua, do par lat/lng do cadastro, do pin
--                  no mapa ou do campo `endereco_completo` que já é coordenada.
--   'aproximada' — veio de geocodificar só bairro/cidade: é o centro da região,
--                  não o cliente.
--   NULL         — importado antes desta coluna existir; não se sabe. NULL e
--                  não um default: dizer 'exata' para 3,4 mil linhas herdadas
--                  seria afirmar o que ninguém verificou.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table clientes
  add column if not exists coordenada_origem text;

-- Idempotente na mão: `add constraint` não aceita `if not exists`, e o erro
-- abortaria o resto do script se ele fosse rodado duas vezes.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'clientes'::regclass and conname = 'clientes_coordenada_origem_check'
  ) then
    alter table clientes
      add constraint clientes_coordenada_origem_check
      check (coordenada_origem in ('exata', 'aproximada'));
  end if;
end $$;

comment on column clientes.coordenada_origem is
  'De onde vieram lat/lng: exata = endereço/pin/coordenada do cadastro; aproximada = centro do bairro ou da cidade; NULL = herdado da importação, não verificado.';

-- Índice parcial: a tela filtra por "GPS aproximado", que é a minoria das
-- linhas. Um índice cheio pagaria por 3,4 mil NULLs que ninguém consulta.
create index if not exists clientes_coord_aproximada_idx
  on clientes (coordenada_origem)
  where coordenada_origem = 'aproximada';

-- Sem policy nova: a coluna herda as policies da tabela `clientes`. Consultor
-- que já podia atualizar o próprio cliente passa a poder escrever aqui também —
-- é campo informativo, não controla acesso a nada.
