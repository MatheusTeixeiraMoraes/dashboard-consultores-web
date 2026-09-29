-- ============================================================
-- Reparo de dado: a coordenada exata estava na coluna errada
--
-- POR QUE: 190 clientes marcados `coordenada_origem = 'aproximada'` têm em
-- `lat`/`lng` o CENTROIDE do bairro (11 clientes do Marco/Belém dividiam um
-- ponto só), enquanto o ponto real de cada um já estava no banco — guardado
-- em `endereco_completo`, que nesses casos não é endereço escrito, e sim o
-- par "lat, lng" capturado na origem.
--
-- Erro médio do que está gravado: 1,32 km. Pior caso: 13,4 km. Não é
-- estimativa nem geocodificação: é copiar o valor certo de uma coluna para a
-- outra, com o dado que já existe.
--
-- FORA DO REPARO, de propósito: os 2 clientes cujo texto fica a mais de 5 km
-- do pino atual. Reverse geocoding mostrou que neles o texto cai num bairro
-- DIFERENTE do declarado (Outeiro x Parque Verde; Curió-Utinga x Benguí) —
-- não há como saber daqui qual lado está errado, e corrigir cego trocaria um
-- erro por outro. Seguem 'aproximada', para conferência de quem vai ao local.
--
-- Reversível: `clientes_coord_backup_20260929` guarda lat/lng/origem de antes.
--
-- Rodar no SQL Editor do Supabase. Idempotente (a 2ª execução não acha linha
-- 'aproximada' com coordenada no texto divergente, porque a 1ª já as marcou
-- 'exata').
-- ============================================================

-- Alvo do reparo, congelado numa tabela: o mesmo conjunto serve de backup e
-- de filtro do UPDATE, então não há risco de as duas queries divergirem.
create table if not exists clientes_coord_backup_20260929 as
with t as (
  select id, lat, lng, coordenada_origem,
         split_part(endereco_completo, ',', 1)::float8 as tlat,
         split_part(endereco_completo, ',', 2)::float8 as tlng
  from clientes
  where coordenada_origem = 'aproximada'
    and lat is not null
    and endereco_completo ~ '^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$'
)
select id, lat, lng, coordenada_origem, tlat, tlng,
       2*6371*asin(sqrt(
         power(sin(radians(tlat-lat)/2),2) +
         cos(radians(lat))*cos(radians(tlat))*power(sin(radians(tlng-lng)/2),2)
       )) as km,
       now() as salvo_em
from t;

-- Backup guarda coordenada de cliente: mesma regra das outras tabelas — RLS
-- ligada e NENHUMA policy, então só o service_role enxerga. Ninguém precisa
-- ler isto pela aplicação; existe para poder desfazer.
alter table clientes_coord_backup_20260929 enable row level security;
revoke all on clientes_coord_backup_20260929 from anon, authenticated;

update clientes c
   set lat = b.tlat,
       lng = b.tlng,
       -- O par do texto é o ponto capturado no estabelecimento: é 'exata' no
       -- sentido que a coluna define, e some o badge "GPS aproximado".
       coordenada_origem = 'exata',
       updated_at = now()
  from clientes_coord_backup_20260929 b
 where c.id = b.id
   and b.km > 0.1    -- abaixo de 100 m o pino já estava bom; não mexe
   and b.km <= 5     -- acima de 5 km o texto conflita com o bairro declarado
   and b.tlat between -34 and 5.3
   and b.tlng between -74 and -34.8
   and c.coordenada_origem = 'aproximada';
