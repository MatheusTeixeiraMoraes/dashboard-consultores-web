-- ============================================================================
-- Log de atividade: marcar o que foi feito DENTRO de uma delegação
--
-- O PROBLEMA: "entrar na conta de" troca a sessão de verdade (magiclink), então
-- durante a delegação `getProfile()` devolve o CONSULTOR — e é ele que aparece
-- no log como autor de tudo. Uma rota criada pelo líder na conta do consultor
-- fica indistinguível de uma que o consultor criou sozinho. A migration de
-- `acessos_delegados` já avisava disto: "com escrita liberada, o banco grava as
-- ações no nome do consultor e, sem registro, nem quem fez consegue reconstruir
-- depois o que foi a gestão e o que foi a pessoa". Até hoje a reconstrução
-- exigia cruzar horários na mão.
--
-- A SOLUÇÃO: três colunas opcionais. O ATOR CONTINUA SENDO O CONSULTOR — é a
-- verdade do que aconteceu no banco, e trocá-lo pelo líder faria o log mentir
-- na direção oposta. O que entra é quem estava dentro da conta na hora.
--
-- Nulas em todo evento normal, e em todos os eventos já gravados: null = ação
-- direta, sem delegação.
--
-- Nomes CONGELADOS em texto, como em `eventos_atividade.ator_nome` e em
-- `acessos_delegados`: o log tem que continuar legível se o perfil do líder for
-- excluído meses depois. A FK vira null (`on delete set null`) e o texto fica.
--
-- ---------------------------------------------------------------------------
-- DE ONDE SAI O CARIMBO, e por que NÃO do cookie.
--
-- `src/lib/atividade.ts` lê a delegação ABERTA em `acessos_delegados`, tabela
-- que só o servidor escreve com service_role dentro de `entrarNaConta`.
--
-- O cookie `delegacao_origem` seria mais barato e está ERRADO: httpOnly impede
-- o JS de LER e SOBRESCREVER, mas NÃO impede o navegador de CRIAR um cookie com
-- esse nome (está documentado em `src/lib/delegacao.ts`, custou uma revisão
-- inteira para aparecer). Carimbar o log a partir dele deixaria qualquer
-- consultor forjar "via Fulano, o admin" nas próprias ações — falsificar
-- auditoria é pior do que não ter auditoria.
--
-- RLS não muda: `eventos_atividade` continua leitura de admin/dono, sem
-- nenhuma policy de escrita, com o revoke por cima. Colunas novas herdam isso.
--
-- Idempotente.
-- ============================================================================

alter table eventos_atividade
  add column if not exists delegado_por_id    uuid references profiles(id) on delete set null,
  add column if not exists delegado_por_nome  text,
  add column if not exists delegado_por_email text;

-- ----------------------------------------------------------------------------
-- Índice para a consulta nova: "existe delegação aberta cujo ALVO é esta
-- pessoa?", feita a cada evento registrado.
--
-- O índice que já existia é por `admin_id` (usado para fechar a delegação
-- anterior de quem entra numa segunda conta) e não serve para este lado. A
-- tabela é pequena, mas a consulta roda em toda escrita logada do sistema.
-- ----------------------------------------------------------------------------
create index if not exists acessos_delegados_alvo_aberto_idx
  on acessos_delegados (alvo_id, iniciado_em desc) where encerrado_em is null;

-- ----------------------------------------------------------------------------
-- Conferência no mesmo run: as três colunas existem e são nullable?
-- Esperado: 3 linhas, todas com is_nullable = YES.
-- ----------------------------------------------------------------------------
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'eventos_atividade'
   and column_name like 'delegado_por%'
 order by column_name;
