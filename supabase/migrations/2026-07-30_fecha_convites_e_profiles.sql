-- ============================================================
-- Dois furos confirmados em produção pela auditoria de 30/07/2026, ambos com a
-- mesma causa: policy escrita com `using` (que diz QUAIS LINHAS) sem `with
-- check` (que diz QUAIS VALORES). `using` nao restringe o que se grava.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. convites_acesso: tirar a escrita da mao do navegador.
--
-- As policies de INSERT/UPDATE liberavam admin e dono. Sem `with check` por
-- coluna, um DONO gravava a linha que quisesse — inclusive `role: 'admin'`,
-- que o gate de `gerarLinkAcesso` (canManageUsers) existe justamente para
-- impedir. Reproduzido: POST direto no PostgREST com a sessao do dono
-- devolveu 201 com role=admin, e bastaria abrir /convite/<token> para nascer
-- uma conta admin. O mesmo buraco anulava o teto de 30 dias e o uso unico
-- (dava para zerar `usado_em`).
--
-- A tabela NUNCA precisa ser escrita pelo navegador: `gerarLinkAcesso` e
-- `revogarLink` gravam com service_role, que atravessa a RLS e nao depende
-- destas policies. Some com a escrita e o gate da aplicacao volta a ser a
-- unica porta — que e o desenho pretendido.
-- ────────────────────────────────────────────────────────────
drop policy if exists "convites: admin e dono criam" on convites_acesso;
drop policy if exists "convites: admin e dono revogam" on convites_acesso;

-- Cinto e suspensorio: sem o GRANT, mesmo que uma policy volte por engano no
-- futuro, o PostgREST responde "permission denied" antes de avaliar RLS.
revoke insert, update, delete on convites_acesso from anon, authenticated;

-- A leitura continua, e a tela de gestao depende dela.
-- (a policy "convites: admin e dono leem" segue de pe)


-- ────────────────────────────────────────────────────────────
-- 2. profiles: parar de entregar o diretorio inteiro da empresa.
--
-- A policy era `for select using (auth.uid() is not null)`: bastava ter um JWT
-- valido para ler nome, e-mail, papel e id_carteira de TODO MUNDO. E o JWT nao
-- exige convite — o cadastro publico do Supabase esta ligado, entao um estranho
-- da internet se cadastra, confirma o proprio e-mail e le a lista (confirmado:
-- uma conta SEM linha em profiles leu as 4 linhas, incluindo qual delas e o
-- admin).
--
-- Isso e material de phishing dirigido e, pior, e o insumo dos ataques que
-- precisam do nome/e-mail exatos do admin.
--
-- DROP e obrigatorio: policies permissivas se SOMAM com OR, entao criar uma
-- restritiva ao lado da antiga nao muda nada.
-- ────────────────────────────────────────────────────────────
-- Os DOIS drops: o do nome antigo e o do nome NOVO. Sem o segundo, re-executar
-- este arquivo morre em 42710 (`create policy` não aceita `if not exists`) e
-- aborta o que vier depois.
drop policy if exists "profiles: leitura autenticada" on profiles;
drop policy if exists "profiles: cada um le o seu; gestao le todos" on profiles;

create policy "profiles: cada um le o seu; gestao le todos" on profiles
  for select using (
    id = auth.uid()
    or get_my_role() in ('admin', 'dono', 'lider')
  );

-- Nota de compatibilidade, conferida antes de trocar: as telas que leem
-- `profiles` de outras pessoas com a sessao do usuario ja estao atras de gate
-- de gestao — usuarios/page.tsx, carteira/page.tsx e o datalist de
-- clientes/page.tsx (so quando podeGerir). `perfilReal()` le a propria linha,
-- coberta pelo `id = auth.uid()`. `get_my_role()` e security definer, entao
-- consultar profiles aqui dentro nao reentra na RLS.
