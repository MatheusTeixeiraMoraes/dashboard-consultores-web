-- ============================================================
-- Coordenada que veio capturada na planilha é 'exata', não "não verificada"
--
-- POR QUE: `coordenada_origem = NULL` foi criado como "herdado da importação,
-- ninguém sabe". Estava errado por excesso de cautela: essas coordenadas
-- vieram CAPTURADAS no estabelecimento, uma por cliente. A evidência bate —
-- 2.076 clientes ocupam 2.076 pontos distintos, nenhum repetido. Centroide de
-- bairro se denuncia por empilhamento, e aqui não há nenhum.
--
-- Deixá-las como "não verificado" fazia a tela pedir revisão da maior fatia da
-- base sem motivo, e afogava os 525 que a máquina de fato chutou — que são a
-- fila de trabalho de verdade.
--
-- FORA DA PROMOÇÃO, 57 que não passam no teste:
--   36 com coordenada fora dos limites do Brasil (30 com o sinal da latitude
--      perdido, 5 caindo em outro país, 4 com o número quebrado na importação)
--   21 cujo `endereco_completo` também traz um par de coordenadas, e esse par
--      diverge mais de 100 m do que está em lat/lng — com dois valores
--      discordando, não dá para eleger um daqui.
-- Esses seguem NULL: continuam aparecendo como "Não verificado" na tela, que
-- é exatamente o que são.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create table if not exists clientes_origem_backup_20260929c as
select id, coordenada_origem, now() as salvo_em
from clientes
where coordenada_origem is null
  and lat is not null
  and lat between -34 and 5.3
  and lng between -74 and -34.8
  -- Quando o campo de endereço TAMBÉM é um par de coordenadas, os dois têm de
  -- concordar; discordando, nenhum dos lados é confiável o bastante.
  and coalesce(
        case when endereco_completo ~ '^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$'
          then 2*6371*asin(sqrt(
            power(sin(radians(split_part(endereco_completo,',',1)::float8 - lat)/2),2) +
            cos(radians(lat))*cos(radians(split_part(endereco_completo,',',1)::float8))*
            power(sin(radians(split_part(endereco_completo,',',2)::float8 - lng)/2),2)))
        end, 0) <= 0.1;

alter table clientes_origem_backup_20260929c enable row level security;
revoke all on clientes_origem_backup_20260929c from anon, authenticated;

-- Sem tocar em `updated_at`: o carimbo de tempo é a única pista que resta para
-- reconstruir o que cada rodada de geocodificação em massa alcançou.
update clientes c
   set coordenada_origem = 'exata'
  from clientes_origem_backup_20260929c b
 where c.id = b.id
   and c.coordenada_origem is null;
