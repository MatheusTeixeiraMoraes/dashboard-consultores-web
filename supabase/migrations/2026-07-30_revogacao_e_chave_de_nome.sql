-- ============================================================
-- Três pendências que sobraram da auditoria, numa migration só porque elas se
-- tocam: todas passam por `get_my_role()` / `cliente_e_meu()`.
--
--  1. `profiles.ativo` era coluna MORTA. Escrita em 3 lugares, lida por
--     ninguém: nem policy, nem get_my_role(), nem a aplicação. Desativar um
--     usuário não cortava nada — a única revogação real era excluir a conta
--     (irreversível). Agora `ativo` vira gate de verdade.
--  2. `get_my_role()` e `cliente_e_meu()` eram as duas únicas funções
--     `security definer` do projeto sem `set search_path`.
--  3. `profiles.nome` é a chave de autorização de clientes e rotas e não tinha
--     unicidade: dois perfis com o mesmo nome enxergam a mesma carteira.
--
-- Idempotente: `create or replace` + `drop ... if exists`.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. Normalização, num lugar só.
--
-- A autorização compara nome com lower+unaccent+trim. Enquanto essa expressão
-- viver copiada em vários lugares, índice e RLS podem divergir — e aí o banco
-- garante a unicidade de uma coisa enquanto a permissão compara outra.
--
-- IMMUTABLE porque índice exige. `unaccent(text)` sozinha é STABLE (resolve o
-- dicionário pelo search_path), e é justamente por isso que o `set search_path`
-- abaixo não é opcional: ele fixa a resolução e torna o resultado determinístico.
-- `public, extensions` cobre as duas instalações possíveis do unaccent no
-- Supabase (via SQL cai em public; via painel cai em extensions).
-- ────────────────────────────────────────────────────────────
create or replace function nome_normalizado(txt text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select lower(unaccent(trim(coalesce(txt, ''))))
$$;


-- ────────────────────────────────────────────────────────────
-- 1. cliente_e_meu: mesmo comportamento, agora chamando a função acima e com
--    search_path fixo. Sem o SET, um search_path hostil poderia trocar o que
--    `profiles` e `unaccent` significam dentro de uma função security definer.
-- ────────────────────────────────────────────────────────────
create or replace function cliente_e_meu(consultor_nome text)
returns boolean
language sql
security definer
stable
set search_path = public, extensions
as $$
  select nome_normalizado(consultor_nome)
       = nome_normalizado((select nome from profiles where id = auth.uid()))
$$;


-- ────────────────────────────────────────────────────────────
-- 2. get_my_role: o gate de revogação.
--
-- Uma linha (`and ativo`) fecha de uma vez clientes, rotas, campanhas,
-- mp_carteira, mp_acionaveis, score_uploads, score_consultor_resultados e
-- convites_acesso — todas as policies desses pendem desta função. Inativo
-- passa a receber NULL, e `NULL in (...)` nunca é verdadeiro.
--
-- Não é preciso mexer em cliente_e_meu: toda policy que a usa exige
-- `get_my_role() = 'consultor'` antes, e o NULL já mata a linha ali.
-- ────────────────────────────────────────────────────────────
create or replace function get_my_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid() and ativo
$$;


-- ────────────────────────────────────────────────────────────
-- 3. A ARMADILHA DE NULL — sem isto, o passo 2 ABRE um buraco em vez de fechar.
--
-- `reconciliar_carteira` protege-se com:
--     if get_my_role() not in ('admin','dono') then raise exception
-- Em SQL, `NULL not in (...)` é NULL, e `if NULL then` NÃO executa. Ou seja: no
-- instante em que get_my_role() passa a devolver NULL para inativo, esse guard
-- para de disparar e um admin DESATIVADO consegue rodar a função — que reescreve
-- a carteira inteira com security definer. O `is null or` na frente é o conserto.
--
-- A função é recriada inteira porque Postgres não permite emendar corpo; o resto
-- do corpo é idêntico ao de 2026-07-21_carteira_fonte_da_verdade.sql.
-- ────────────────────────────────────────────────────────────
create or replace function reconciliar_carteira(p_data date, p_aplicar boolean default false, p_forcar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total     int;
  v_anterior  int;
  v_stubs     int;
  v_reatrib   int;
  v_ocultar   int;
  v_reativar  int;
  v_base      int;
  v_sem_perfil jsonb;
  v_bloqueado boolean;
begin
  if get_my_role() is null or get_my_role() not in ('admin', 'dono') then
    raise exception 'sem permissão para reconciliar carteira';
  end if;

  select count(*) into v_total from mp_carteira where data_referencia = p_data;
  if v_total = 0 then
    raise exception 'snapshot % está vazio — nada para reconciliar', p_data;
  end if;

  select count(*) into v_anterior from mp_carteira
   where data_referencia = (select max(data_referencia) from mp_carteira where data_referencia < p_data);

  select count(*) into v_base from clientes;

  select count(*) into v_stubs from mp_carteira mc
   where mc.data_referencia = p_data
     and not exists (select 1 from clientes c where c.seller_id = mc.seller_id);

  select count(*) into v_reatrib from clientes c
    join mp_carteira mc on mc.seller_id = c.seller_id and mc.data_referencia = p_data
   where c.consultor_nome is distinct from mc.consultor_nome;

  select count(*) into v_ocultar from clientes c
   where c.em_carteira
     and not exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);

  select count(*) into v_reativar from clientes c
   where not c.em_carteira
     and exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);

  select coalesce(jsonb_agg(distinct mc.consultor_nome), '[]'::jsonb) into v_sem_perfil
    from mp_carteira mc
   where mc.data_referencia = p_data
     and not exists (
       select 1 from profiles p
        where nome_normalizado(p.nome) = nome_normalizado(mc.consultor_nome));

  v_bloqueado := (v_anterior > 0 and v_total < v_anterior * 0.8)
              or (v_base > 0 and v_ocultar > v_base * 0.15);

  if p_aplicar and (not v_bloqueado or p_forcar) then
    insert into clientes (seller_id, consultor_nome, em_carteira, created_by)
      select mc.seller_id, mc.consultor_nome, true, auth.uid()
        from mp_carteira mc
       where mc.data_referencia = p_data
         and not exists (select 1 from clientes c where c.seller_id = mc.seller_id);

    update clientes c
       set consultor_nome = mc.consultor_nome
      from mp_carteira mc
     where mc.data_referencia = p_data
       and mc.seller_id = c.seller_id
       and c.consultor_nome is distinct from mc.consultor_nome;

    update clientes c set em_carteira = false
     where c.em_carteira
       and not exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);

    update clientes c set em_carteira = true
     where not c.em_carteira
       and exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);
  end if;

  return jsonb_build_object(
    'aplicado',        p_aplicar and (not v_bloqueado or p_forcar),
    'bloqueado',       v_bloqueado,
    'total_snapshot',  v_total,
    'total_anterior',  v_anterior,
    'stubs',           v_stubs,
    'reatribuidos',    v_reatrib,
    'ocultados',       v_ocultar,
    'reativados',      v_reativar,
    'sem_perfil',      v_sem_perfil);
end
$$;


-- ────────────────────────────────────────────────────────────
-- 4. pillar_config era a única policy que não passava por get_my_role(): usava
--    `auth.uid() is not null`. Sem isto, um usuário desativado continuaria
--    lendo as metas da empresa.
--
--    A policy de SELECT de `profiles` (migration de 30/07) mantém de propósito o
--    ramo `id = auth.uid()`: é ele que deixa a aplicação ler a própria linha e
--    dizer "seu acesso foi desativado" em vez de jogar a pessoa num laço mudo
--    de login. Escrever nessa linha já está travado pelo trigger.
-- ────────────────────────────────────────────────────────────
-- Os DOIS drops: o do nome antigo (que estamos substituindo) e o do nome NOVO.
-- Sem o segundo, a re-execução morre em 42710 — `create policy` não aceita
-- `if not exists`.
drop policy if exists "pillar_config: todos leem" on pillar_config;
drop policy if exists "pillar_config: usuário ativo lê" on pillar_config;

create policy "pillar_config: usuário ativo lê" on pillar_config
  for select using (get_my_role() is not null);


-- ────────────────────────────────────────────────────────────
-- 5. Unicidade do nome — PARCIAL, e o predicado é o ponto.
--
-- `nome` só é chave de autorização quando o papel é consultor: as policies de
-- clientes e rotas chamam cliente_e_meu() sempre atrás de
-- `get_my_role() = 'consultor'`. Então a trava vale só aí:
--   - admin/dono/líder ficam de fora (o nome deles é rótulo de tela, e homônimo
--     legítimo entre um dono e um consultor não pode virar erro de gravação);
--   - nome vazio fica de fora, senão o `default ''` do schema faria o SEGUNDO
--     perfil sem nome estourar com erro cru do Postgres.
--
-- `ativo` NÃO entra no predicado de propósito: desativar não desliga
-- cliente_e_meu, então um homônimo inativo ainda casaria a carteira.
--
-- Conferido antes de criar: a base tem 4 perfis, zero colisões normalizadas e
-- zero nomes vazios — entra sem conflito.
-- ────────────────────────────────────────────────────────────
drop index if exists profiles_nome_consultor_unico;

create unique index profiles_nome_consultor_unico
  on profiles (nome_normalizado(nome))
  where role = 'consultor' and trim(nome) <> '';
