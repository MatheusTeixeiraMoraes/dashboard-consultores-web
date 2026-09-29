-- ============================================================
-- Corrige a promoção anterior: só quem tem a COORDENADA ESCRITA é conferido
--
-- A migration `2026-09-29_coordenada_planilha_e_exata.sql` promoveu a 'exata'
-- todos os 2.019 clientes íntegros que estavam com origem NULL, apoiada em
-- que nenhum deles compartilha ponto com outro. Argumento fraco: não haver
-- empilhamento prova que não é centroide de bairro, não prova que alguém
-- esteve no local.
--
-- A prova de captura em campo é a coordenada estar ESCRITA no cadastro, em
-- `endereco_completo`. Onde o campo traz uma rua, a lat/lng pode ter saído de
-- qualquer lugar — inclusive de uma geocodificação feita por quem montou a
-- planilha, que é o mesmo chute que a nossa máquina dá.
--
-- Então: quem tem o par escrito continua 'exata'; quem tem só a rua volta
-- para 'estimada' e entra na fila de revisão, esperando alguém confirmar o
-- ponto com coordenada de verdade.
--
-- Mexe SÓ nas linhas que a migration anterior promoveu (as que estão em
-- `clientes_origem_backup_20260929c`). Quem já era 'exata' antes dela — pino
-- arrastado, botão "conferir", e os 184 do reparo de coluna trocada — não é
-- tocado.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

update clientes c
   set coordenada_origem = 'estimada'
  from clientes_origem_backup_20260929c b
 where c.id = b.id
   and c.coordenada_origem = 'exata'
   and c.endereco_completo !~ '^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$';

-- 'estimada' deixa de significar só "a nossa máquina buscou" e passa a
-- significar "o ponto não tem procedência comprovada" — o que inclui a
-- coordenada que veio na planilha sem a captura escrita ao lado. Para o
-- consultor dá no mesmo: em ambos os casos falta alguém confirmar no local.
comment on column clientes.coordenada_origem is
  'De onde vieram lat/lng: exata = coordenada capturada e escrita no cadastro, alfinete arrastado no mapa ou confirmada por um humano; estimada = ponto sem procedência comprovada (buscado por endereço, ou herdado da planilha sem a captura escrita) — precisa revisão; aproximada = centro do bairro/cidade; NULL = coordenada suspeita (fora do Brasil ou contradiz o cadastro).';
