-- ============================================================
-- Terceiro valor de `coordenada_origem`: 'estimada'
--
-- POR QUE: 'exata' estava carregando duas coisas muito diferentes — o ponto
-- que um humano conferiu (arrastou o alfinete, digitou, ou veio capturado no
-- local) e o CHUTE da máquina, que buscou o endereço escrito num serviço de
-- geocodificação e erra de 10 a 130 m. Numa quadra densa, 130 m é a loja
-- errada. Indistinguíveis, o consultor não tinha como saber em qual confiar,
-- e foi assim que o relato "mudaram minhas coordenadas" demorou a ser
-- entendido.
--
--   'exata'      — humano conferiu, ou o par veio capturado no estabelecimento.
--   'estimada'   — a MÁQUINA buscou pelo endereço escrito. Serve pra aparecer
--                  no mapa; PRECISA de um humano confirmar antes de virar
--                  parada de rota de confiança.
--   'aproximada' — centro do bairro/cidade. Pior que estimada: nem endereço havia.
--   NULL         — herdado da importação, ninguém verificou.
--
-- BACKFILL: 525 clientes das 3 rodadas de geocodificação em massa registradas
-- em `eventos_atividade` (26/08 · 17/09 · 26/09, 543 declarados; 525 ainda
-- identificáveis pelo `updated_at` — o resto foi editado depois e perdeu a
-- pista). Todos os 525 vieram de busca por TEXTO: nenhum usou o atalho de
-- coordenada-no-texto, que seria exato de verdade. Conferido antes de rodar.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- `add constraint` não aceita `if not exists`, e o erro abortaria o resto do
-- script — mesmo cuidado da migration que criou a coluna.
do $$
begin
  alter table clientes drop constraint if exists clientes_coordenada_origem_check;
  alter table clientes
    add constraint clientes_coordenada_origem_check
    check (coordenada_origem in ('exata', 'estimada', 'aproximada'));
end $$;

comment on column clientes.coordenada_origem is
  'De onde vieram lat/lng: exata = humano conferiu ou capturado no local; estimada = a máquina buscou pelo endereço escrito (precisa revisão); aproximada = centro do bairro/cidade; NULL = herdado da importação, não verificado.';

-- Índice parcial: a tela filtra por "precisa revisão", que é a minoria.
create index if not exists clientes_coord_estimada_idx
  on clientes (coordenada_origem)
  where coordenada_origem = 'estimada';

-- Guarda o que era antes, pra poder desfazer.
create table if not exists clientes_origem_backup_20260929b as
select id, coordenada_origem, updated_at, now() as salvo_em
from clientes
where ((updated_at >= '2026-08-26 11:00' and updated_at < '2026-08-26 13:00')
    or (updated_at >= '2026-09-17 12:00' and updated_at < '2026-09-17 15:00')
    or (updated_at >= '2026-09-25 23:00' and updated_at < '2026-09-26 01:30'))
  and endereco_completo !~ '^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$'
  and coordenada_origem is distinct from 'aproximada';

alter table clientes_origem_backup_20260929b enable row level security;
revoke all on clientes_origem_backup_20260929b from anon, authenticated;

-- NÃO mexe em `updated_at`: mudar o carimbo apagaria justamente a pista que
-- identifica estas linhas, e um segundo backfill não teria como se achar.
update clientes c
   set coordenada_origem = 'estimada'
  from clientes_origem_backup_20260929b b
 where c.id = b.id
   and c.coordenada_origem is distinct from 'estimada';
