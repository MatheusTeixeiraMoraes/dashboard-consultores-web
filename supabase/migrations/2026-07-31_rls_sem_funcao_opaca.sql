-- ============================================================================
-- Performance de RLS: tirar `cliente_e_meu()` da frente do planner.
--
-- NÃO MUDA QUEM VÊ O QUÊ. É reescrita mecânica do MESMO predicado numa forma
-- que o Postgres consegue avaliar uma vez em vez de uma vez por linha.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
--
-- A policy de consultor é, hoje:
--     get_my_role() = 'consultor' and cliente_e_meu(consultor_nome)
--
-- `cliente_e_meu` recebe uma COLUNA, então é por linha por definição. Pior: ela
-- é `security definer` E tem `set search_path`, e o inliner do Postgres recusa
-- os dois casos (`inline_function()` rejeita `prosecdef` e `proconfig` não
-- nulo). Resultado: o planner enxerga uma caixa-preta booleana, e para CADA
-- linha varrida roda uma chamada de função que por dentro faz
-- `select nome from profiles where id = auth.uid()`.
--
-- Em `clientes` (~3,2 mil linhas) isso é ~3,2 mil chamadas + ~3,2 mil buscas em
-- profiles. E `buscarTudo` dispara a consulta 5 vezes por abertura de tela
-- (1 count + 4 páginas), nas 4 tabelas.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO
--
-- Separar o que varia por linha do que não varia:
--   - `nome_normalizado(consultor_nome)` — depende da linha, mas é IMMUTABLE e
--     barato, sem acesso a tabela;
--   - `(select meu_nome_norm())` — não depende da linha. Envolto em `select`,
--     o planner o trata como InitPlan e avalia UMA VEZ por consulta.
-- O mesmo vale para `(select get_my_role())`.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRATION NÃO FAZ, DE PROPÓSITO
--
-- 1. NÃO cria índice. Seria intuitivo indexar `nome_normalizado(consultor_nome)`,
--    mas não seria usado: com duas policies permissivas de SELECT o planner
--    recebe `A or (B and C)`, e bitmap OR exige caminho de índice em TODO braço
--    do OR — `A = get_my_role() in (...)` não tem. O índice ficaria parado no
--    SELECT e só pesaria no INSERT (importações de milhares de linhas). O ganho
--    aqui é sair de "varredura + 3,2 mil chamadas de função com busca em
--    profiles" para "varredura + comparação de texto contra uma constante".
--    É ganho de CPU, não de plano.
--
-- 2. NÃO acrescenta `with check` nas policies de UPDATE de consultor. Hoje elas
--    só têm `using`, o que deixa um consultor reatribuir a própria linha para
--    outro nome. É buraco real, mas fechá-lo MUDA comportamento e não tem nada
--    a ver com performance — vira issue própria.
--
-- 3. NÃO apaga `cliente_e_meu()`. Ela deixa de ser usada nas policies quentes,
--    mas apagar é destrutivo e desnecessário.
--
-- ---------------------------------------------------------------------------
-- ARMADILHAS JÁ PAGAS NESTE REPO (por isso a forma abaixo)
--
-- - `create policy` NÃO aceita `if not exists`, e o erro 42710 aborta o script
--   inteiro. Já aconteceu 2x aqui. Daí o `drop policy if exists` antes de cada.
-- - O `drop policy if exists` com nome ERRADO não falha: não faz nada. Aí o
--   `create` cria uma SEGUNDA policy permissiva, a antiga continua no OR com a
--   função opaca dentro, e o ganho é ZERO — sem nenhum aviso. Os nomes abaixo
--   foram copiados LITERALMENTE dos arquivos de origem, COM acento
--   (`lê`, `as suas`). Os de mp_* são sem acento mesmo (`le a sua`).
-- - Tudo numa transação: qualquer erro reverte inteiro.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- O nome normalizado de quem está logado — SEM argumento.
--
-- É essa ausência de argumento que faz a diferença: como não depende da linha,
-- `(select meu_nome_norm())` vira InitPlan e roda uma vez por consulta.
--
-- Continua `security definer` porque precisa ler `profiles` de um jeito que a
-- RLS de profiles não atrapalhe — mesma razão de `cliente_e_meu`. E mantém
-- `set search_path`, sem o qual um search_path hostil poderia trocar o que
-- `profiles` e `unaccent` significam dentro de uma função security definer.
--
-- A forma `nome_normalizado((select ...))` — subconsulta DENTRO do argumento —
-- não é estilo: é o que reproduz exatamente o valor de hoje. `cliente_e_meu`
-- fazia `nome_normalizado((select nome from profiles ...))`, e `nome_normalizado`
-- tem `coalesce(txt,'')` dentro, então usuário sem linha em profiles resultava
-- em ''. Escrever `select nome_normalizado(nome) from profiles where ...`
-- devolveria NULL nesse caso (zero linhas) em vez de '' — mudança silenciosa de
-- semântica, justamente o que esta migration não pode fazer.
-- ----------------------------------------------------------------------------
create or replace function meu_nome_norm()
returns text
language sql
security definer
stable
set search_path = public, extensions
as $$
  select nome_normalizado((select nome from profiles where id = (select auth.uid())))
$$;

revoke all on function meu_nome_norm() from public, anon;
grant execute on function meu_nome_norm() to authenticated;


-- ============================================================================
-- clientes
-- ============================================================================
drop policy if exists "clientes: admin, dono e lider leem tudo" on clientes;
create policy "clientes: admin, dono e lider leem tudo" on clientes
  for select using ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "clientes: consultor lê os seus (por nome)" on clientes;
create policy "clientes: consultor lê os seus (por nome)" on clientes
  for select using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "clientes: admin e dono inserem qualquer" on clientes;
create policy "clientes: admin e dono inserem qualquer" on clientes
  for insert with check ((select get_my_role()) in ('admin', 'dono'));

-- `with check`, não `using` — preservando a forma original.
drop policy if exists "clientes: consultor insere nos seus" on clientes;
create policy "clientes: consultor insere nos seus" on clientes
  for insert with check (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "clientes: admin e dono atualizam qualquer" on clientes;
create policy "clientes: admin e dono atualizam qualquer" on clientes
  for update using ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "clientes: consultor atualiza os seus" on clientes;
create policy "clientes: consultor atualiza os seus" on clientes
  for update using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "clientes: admin e dono apagam qualquer" on clientes;
create policy "clientes: admin e dono apagam qualquer" on clientes
  for delete using ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "clientes: consultor apaga os seus" on clientes;
create policy "clientes: consultor apaga os seus" on clientes
  for delete using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );


-- ============================================================================
-- rotas — mesmo padrão. ATENÇÃO ao acento em "lê" e ao "as suas".
-- ============================================================================
drop policy if exists "rotas: admin, dono e lider leem tudo" on rotas;
create policy "rotas: admin, dono e lider leem tudo" on rotas
  for select using ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "rotas: consultor lê as suas (por nome)" on rotas;
create policy "rotas: consultor lê as suas (por nome)" on rotas
  for select using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "rotas: admin e dono inserem qualquer" on rotas;
create policy "rotas: admin e dono inserem qualquer" on rotas
  for insert with check ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "rotas: consultor insere as suas" on rotas;
create policy "rotas: consultor insere as suas" on rotas
  for insert with check (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "rotas: admin e dono atualizam qualquer" on rotas;
create policy "rotas: admin e dono atualizam qualquer" on rotas
  for update using ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "rotas: consultor atualiza as suas" on rotas;
create policy "rotas: consultor atualiza as suas" on rotas
  for update using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "rotas: admin e dono apagam qualquer" on rotas;
create policy "rotas: admin e dono apagam qualquer" on rotas
  for delete using ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "rotas: consultor apaga as suas" on rotas;
create policy "rotas: consultor apaga as suas" on rotas
  for delete using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );


-- ============================================================================
-- mp_carteira e mp_acionaveis — as tabelas mais quentes das telas de carteira.
-- Nomes SEM acento aqui (foi assim que campanhas.sql criou).
-- ============================================================================
drop policy if exists "mp_carteira: gestao le tudo" on mp_carteira;
create policy "mp_carteira: gestao le tudo" on mp_carteira
  for select using ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "mp_carteira: consultor le a sua" on mp_carteira;
create policy "mp_carteira: consultor le a sua" on mp_carteira
  for select using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "mp_carteira: gestao importa" on mp_carteira;
create policy "mp_carteira: gestao importa" on mp_carteira
  for insert with check ((select get_my_role()) in ('admin', 'dono'));

-- Sem a policy de delete o import falha EM SILÊNCIO: o RLS não devolve erro,
-- apenas apaga zero linhas — e aí o snapshot antigo continua lá, duplicando
-- tudo na tela. Já aconteceu neste projeto.
drop policy if exists "mp_carteira: gestao apaga" on mp_carteira;
create policy "mp_carteira: gestao apaga" on mp_carteira
  for delete using ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "mp_acionaveis: gestao le tudo" on mp_acionaveis;
create policy "mp_acionaveis: gestao le tudo" on mp_acionaveis
  for select using ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "mp_acionaveis: consultor le a sua" on mp_acionaveis;
create policy "mp_acionaveis: consultor le a sua" on mp_acionaveis
  for select using (
    (select get_my_role()) = 'consultor'
    and nome_normalizado(consultor_nome) = (select meu_nome_norm())
  );

drop policy if exists "mp_acionaveis: gestao importa" on mp_acionaveis;
create policy "mp_acionaveis: gestao importa" on mp_acionaveis
  for insert with check ((select get_my_role()) in ('admin', 'dono'));

drop policy if exists "mp_acionaveis: gestao apaga" on mp_acionaveis;
create policy "mp_acionaveis: gestao apaga" on mp_acionaveis
  for delete using ((select get_my_role()) in ('admin', 'dono'));

commit;


-- ============================================================================
-- CONFERÊNCIA OBRIGATÓRIA depois de rodar (não declarar pronto sem isto)
--
-- 1. Nenhuma policy pode ter sobrado chamando cliente_e_meu. Se esta consulta
--    devolver QUALQUER linha, algum `drop` errou o nome e existe agora uma
--    policy duplicada — o ganho é zero e o predicado antigo continua ativo:
--
--      select tablename, policyname
--        from pg_policies
--       where schemaname = 'public'
--         and (qual like '%cliente_e_meu%' or with_check like '%cliente_e_meu%');
--
-- 2. A contagem de policies por tabela tem que ser a MESMA de antes
--    (clientes 8, rotas 8, mp_carteira 4, mp_acionaveis 4). Sobrando, houve
--    duplicação:
--
--      select tablename, count(*) from pg_policies
--       where schemaname='public' and tablename in
--             ('clientes','rotas','mp_carteira','mp_acionaveis')
--       group by tablename order by tablename;
--
-- 3. PROVA DE ISOLAMENTO — a que importa de verdade. Logar como consultor de
--    teste e conferir que ele vê EXATAMENTE os mesmos clientes/rotas/carteira/
--    acionáveis de antes, nem um a mais. Depois repetir como líder e como
--    admin. Usar ALVO FICTÍCIO: o banco é o de produção.
--
-- 4. Medir: `explain (analyze, buffers)` autenticado como consultor, antes e
--    depois. O que deve sumir do plano é a chamada por linha a cliente_e_meu.
-- ============================================================================
