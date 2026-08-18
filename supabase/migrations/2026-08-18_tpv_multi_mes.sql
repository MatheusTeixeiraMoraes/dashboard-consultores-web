-- ============================================================
-- TPV multi-mês — colunas novas na Planilha Ação Oportunidades.
--
-- A partir da planilha de 18/08/2026 o MP passou a mandar, prontas, uma
-- comparação de mesma-data (que o app hoje só APROXIMA dividindo por dias) e
-- duas janelas de mês anteriores (M-2, M-3), além do dia real da última
-- transação na maquininha. Tudo já vem calculado pelo MP — não recalculamos
-- nada, mesmo princípio das colunas de oportunidade que já existiam aqui.
--
-- CONVENÇÃO DE SINAL das colunas "vs" (confirmada linha a linha contra a
-- planilha real de 18/08, não é suposição): valor = período MAIS RECENTE
-- menos período MAIS ANTIGO. Positivo = cresceu; negativo = caiu. Nada
-- invertido — é a subtração comum, sempre "quem vem depois menos quem vem
-- antes":
--   tpv_m3_vs_m1        = TPV mês passado (M1)      − TPV de 3 meses atrás (M3)
--   tpv_m2_vs_m1        = TPV mês passado (M1)      − TPV de 2 meses atrás (M2)
--   tpv_m0_vs_mesma_data = TPV deste mês até hoje (M0) − TPV do mesmo intervalo
--                          de dias no mês passado (tpv_mesma_data_mes_passado)
--
-- Idempotente: `add column if not exists` cada uma, mesmo padrão de
-- 2026-08-04_rota_inter_hexa_recife.sql.
-- ============================================================

alter table mp_carteira add column if not exists tpv_mesma_data_mes_passado numeric;
alter table mp_carteira add column if not exists tpv_m2 numeric;
alter table mp_carteira add column if not exists tpv_m3 numeric;
alter table mp_carteira add column if not exists dias_sem_transacionar integer;
alter table mp_carteira add column if not exists dt_ultima_transacao date;
alter table mp_carteira add column if not exists tpv_m3_vs_m1 numeric;
alter table mp_carteira add column if not exists tpv_m2_vs_m1 numeric;
alter table mp_carteira add column if not exists tpv_m0_vs_mesma_data numeric;

comment on column mp_carteira.tpv_mesma_data_mes_passado is
  'TPV do mês passado, mas só até o mesmo dia da planilha atual — comparável direto com tpv_mes_atual, sem dividir por dias.';
comment on column mp_carteira.dias_sem_transacionar is
  'Dias corridos desde a última transação na maquininha, calculado pelo MP. Substitui a estimativa derivada de comparar snapshots (que só funcionava a partir do 2º envio do mês).';
