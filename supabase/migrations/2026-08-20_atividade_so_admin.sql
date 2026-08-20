-- ============================================================
-- Restringe a tela/log de Atividade a admin — dono deixa de enxergar.
--
-- Decisão explícita do usuário: só o cargo de Administrador acessa
-- "Atividade". Estreita a policy de leitura criada em
-- 2026-08-19_eventos_atividade.sql (que incluía dono).
--
-- Idempotente.
-- ============================================================

drop policy if exists "eventos_atividade: admin e dono leem" on eventos_atividade;
drop policy if exists "eventos_atividade: admin le" on eventos_atividade;
create policy "eventos_atividade: admin le" on eventos_atividade
  for select using (get_my_role() = 'admin');
