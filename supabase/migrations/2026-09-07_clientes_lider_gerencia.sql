-- ============================================================================
-- Clientes: LÍDER passa a gerenciar (não só ler)
--
-- Mesma causa da correção de `rotas` de hoje
-- (2026-09-07_rotas_lider_gerencia.sql): o papel `lider` nasceu só na policy de
-- SELECT. Na tela de Clientes ele vê a carteira inteira e a tela lhe oferece
-- "Novo Cliente", editar, geocodificar e "tirar da carteira" — e todos morriam
-- em "new row violates row-level security policy for table clientes", porque
-- as policies de escrita citam ('admin','dono') e a do consultor exige
-- consultor_nome = o nome dele.
--
-- DECISÃO (07/09/2026): líder gerencia a carteira, MENOS subir planilha.
--   - INSERT e UPDATE: admin, dono, lider.
--   - DELETE: continua admin e dono. Não é restrição teatral — o botão da tela
--     é soft-hide (`em_carteira = false`, um UPDATE), porque apagar a linha faz
--     a próxima reconciliação recriar o cliente como stub em branco e perder o
--     cadastro enriquecido. Ninguém precisa de DELETE de verdade aqui.
--   - Importar planilha fica escondida do líder no front (é upsert em massa da
--     carteira), no mesmo espírito de 2026-08-05_hexa_recife_inclui_lider.sql:
--     "o líder consulta a base e monta rota, não sobe planilha".
--
-- O UPDATE é o que permite ao líder REATRIBUIR o dono de um cliente (a tela só
-- carimba `consultor_nome` para quem é gestão). É o poder central deste papel
-- na carteira, e é deliberado.
--
-- O consultor não é tocado: continua restrito aos clientes do próprio nome.
--
-- ---------------------------------------------------------------------------
-- SEM `begin;`/`commit;`, DE PROPÓSITO — script curto colado à mão no SQL
-- Editor já devolveu "Success. No rows returned" sem gravar dentro de transação
-- explícita (ver 2026-08-05_hexa_recife_inclui_lider.sql). A ordem é que dá a
-- segurança: cada policy nova entra ANTES de a antiga sair, então admin e dono
-- nunca ficam sem escrita nem por um instante.
--
-- ⚠ Se um dia 2026-07-31_rls_sem_funcao_opaca.sql for re-executada, ela RECRIA
-- os nomes antigos ("clientes: admin e dono inserem/atualizam qualquer") ao
-- lado destes. Não tira acesso de ninguém (permissivas somam em OR e "gestao" é
-- superconjunto), mas suja o rastro: rodar esta migration de novo depois, que
-- ela limpa. Foi exatamente o que aconteceu com `rotas` em 07/09/2026.
--
-- Rodar no SQL Editor do Supabase. É re-executável.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INSERT — o botão "Novo Cliente".
-- ----------------------------------------------------------------------------
drop policy if exists "clientes: gestao insere qualquer" on clientes;

create policy "clientes: gestao insere qualquer" on clientes
  for insert with check ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "clientes: admin e dono inserem qualquer" on clientes;

-- ----------------------------------------------------------------------------
-- 2. UPDATE — editar cliente, reatribuir o consultor dono, geocodificar (linha
--    e em massa) e "tirar da carteira".
--
-- `with check` explícito com a MESMA expressão do `using`: sem ele o Postgres
-- reaproveita o `using`, o que aqui dá no mesmo (a expressão só olha o papel,
-- nenhuma coluna). Fica escrito para esta policy não virar mais um caso da
-- armadilha "using não restringe coluna" se alguém acrescentar condição de
-- linha aqui depois.
-- ----------------------------------------------------------------------------
drop policy if exists "clientes: gestao atualiza qualquer" on clientes;

create policy "clientes: gestao atualiza qualquer" on clientes
  for update
   using ((select get_my_role()) in ('admin', 'dono', 'lider'))
  with check ((select get_my_role()) in ('admin', 'dono', 'lider'));

drop policy if exists "clientes: admin e dono atualizam qualquer" on clientes;

-- ----------------------------------------------------------------------------
-- 3. DELETE — NÃO MEXIDO de propósito. "clientes: admin e dono apagam qualquer"
--    continua como está. Está aqui escrito para o próximo leitor não achar que
--    foi esquecimento.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 4. Conferência no mesmo run.
--
-- Esperado: 8 linhas (o mesmo total de antes — duas foram renomeadas, nenhuma
-- criada a mais).
--   clientes: admin e dono apagam qualquer    DELETE  admin, dono
--   clientes: consultor apaga os seus         DELETE  consultor + nome
--   clientes: gestao insere qualquer          INSERT  admin, dono, lider
--   clientes: consultor insere nos seus       INSERT  consultor + nome
--   clientes: admin, dono e lider leem tudo   SELECT  admin, dono, lider
--   clientes: consultor lê os seus (por nome) SELECT  consultor + nome
--   clientes: gestao atualiza qualquer        UPDATE  admin, dono, lider
--   clientes: consultor atualiza os seus      UPDATE  consultor + nome
--
-- Se aparecerem 10 linhas, com "admin e dono inserem/atualizam" ao lado das de
-- gestão, algum drop não pegou: confira o nome (drop com nome errado não falha,
-- só não faz nada).
-- ----------------------------------------------------------------------------
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'clientes'
 order by cmd, policyname;
