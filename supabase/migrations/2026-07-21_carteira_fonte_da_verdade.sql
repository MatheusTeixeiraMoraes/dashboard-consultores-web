-- ============================================================
-- Planilha Geral vira a FONTE DA VERDADE da carteira.
--
-- Até aqui `clientes` (cadastro editável, base das rotas) e `mp_carteira`
-- (snapshot mensal do MP) viviam separadas. Agora a Planilha Geral manda:
--   - quem está nela EXISTE no painel; quem não está, some (soft, ver abaixo);
--   - o dono de cada cliente (consultor_nome) segue a planilha.
--
-- A LINHA QUE NÃO PODE SER CRUZADA: a reconciliação escreve em `clientes`
-- apenas colunas ESTRUTURAIS — seller_id, consultor_nome, em_carteira,
-- created_by. O CONTATO do cliente (nome, telefone, e-mail, CPF/CNPJ, endereço,
-- lat/lng) é digitado pelo consultor e NUNCA é tocado por import. Um teste
-- (separacao-planilhas.test.mjs) quebra se alguma coluna de contato aparecer no
-- corpo da função.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- Membership como coluna persistida, não filtro em runtime: a reconciliação já
-- roda de qualquer jeito (stubs + dono), então marcar em_carteira é um update a
-- mais quase grátis, e as 3 telas ganham um `.eq('em_carteira', true)` limpo.
-- default true: até a 1ª reconciliação, os 3.272 continuam todos visíveis.
alter table clientes
  add column if not exists em_carteira boolean not null default true;

create index if not exists idx_clientes_em_carteira
  on clientes (em_carteira) where em_carteira;

-- ============================================================
-- reconciliar_carteira(data, aplicar, forcar)
--
--   aplicar=false  -> DRY-RUN: só conta o que mudaria (o preview do upload).
--   aplicar=true   -> aplica, se não estiver bloqueado pelo piso de sanidade.
--   forcar=true    -> aplica MESMO bloqueado (o "Aplicar mesmo assim" do upload,
--                     depois do humano ver o preview). Sem isto, o botão seria
--                     mentira: a função recusaria e nada aconteceria.
--
-- security definer: precisa escrever a carteira inteira, então atravessa a RLS.
-- O gate de papel na primeira linha é o que impede consultor de chamar.
-- ============================================================

-- Postgres identifica função por nome + tipos dos args. Adicionar o 3º
-- parâmetro cria uma função NOVA em vez de substituir a de 2 args — as duas
-- coexistiriam e o RPC ficaria ambíguo. Dropa a antiga antes.
drop function if exists reconciliar_carteira(date, boolean);

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
  if get_my_role() not in ('admin', 'dono') then
    raise exception 'sem permissão para reconciliar carteira';
  end if;

  select count(*) into v_total from mp_carteira where data_referencia = p_data;
  if v_total = 0 then
    raise exception 'snapshot % está vazio — nada para reconciliar', p_data;
  end if;

  -- snapshot imediatamente anterior (para o piso de sanidade)
  select count(*) into v_anterior from mp_carteira
   where data_referencia = (select max(data_referencia) from mp_carteira where data_referencia < p_data);

  select count(*) into v_base from clientes;

  -- clientes na planilha que ainda não têm cadastro (viram stub para enriquecer)
  select count(*) into v_stubs from mp_carteira mc
   where mc.data_referencia = p_data
     and not exists (select 1 from clientes c where c.seller_id = mc.seller_id);

  -- cadastro cujo dono diverge da planilha (transferência de carteira)
  select count(*) into v_reatrib from clientes c
    join mp_carteira mc on mc.seller_id = c.seller_id and mc.data_referencia = p_data
   where c.consultor_nome is distinct from mc.consultor_nome;

  -- visíveis hoje que sumiram da planilha (saíram da carteira -> ocultar)
  select count(*) into v_ocultar from clientes c
   where c.em_carteira
     and not exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);

  -- ocultos que voltaram à planilha (reexibir, com o cadastro intacto)
  select count(*) into v_reativar from clientes c
   where not c.em_carteira
     and exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);

  -- consultores da planilha sem profile correspondente: o buraco do vínculo por
  -- nome. Se um nome não casa, aquele consultor abre a tela vazia e sem erro.
  select coalesce(jsonb_agg(distinct mc.consultor_nome), '[]'::jsonb) into v_sem_perfil
    from mp_carteira mc
   where mc.data_referencia = p_data
     and not exists (
       select 1 from profiles p
        where lower(unaccent(trim(p.nome))) = lower(unaccent(trim(mc.consultor_nome))));

  -- PISO DE SANIDADE: freio contra planilha errada/parcial. Bloqueia a aplicação
  -- automática se o snapshot encolheu >20% vs o anterior, ou se ocultaria >15%
  -- da base de uma vez. Nesses casos, exige revisão humana.
  v_bloqueado := (v_anterior > 0 and v_total < v_anterior * 0.8)
              or (v_base > 0 and v_ocultar > v_base * 0.15);

  if p_aplicar and (not v_bloqueado or p_forcar) then
    -- (a) STUBS: só colunas estruturais. Contato fica em branco para o consultor
    --     preencher — nunca inventado aqui.
    insert into clientes (seller_id, consultor_nome, em_carteira, created_by)
      select mc.seller_id, mc.consultor_nome, true, auth.uid()
        from mp_carteira mc
       where mc.data_referencia = p_data
         and not exists (select 1 from clientes c where c.seller_id = mc.seller_id);

    -- (b) DONO: só consultor_nome. Isto É a transferência automática de carteira.
    update clientes c
       set consultor_nome = mc.consultor_nome
      from mp_carteira mc
     where mc.data_referencia = p_data
       and mc.seller_id = c.seller_id
       and c.consultor_nome is distinct from mc.consultor_nome;

    -- (c) MEMBERSHIP, em dois updates com WHERE. Um só `set em_carteira =
    --     exists(...)` sem WHERE tocaria a tabela inteira, e o Postgres recusa
    --     UPDATE sem WHERE (salvaguarda). Assim também só escreve quem muda.
    --     Esconde quem saiu da planilha:
    update clientes c set em_carteira = false
     where c.em_carteira
       and not exists (select 1 from mp_carteira mc where mc.data_referencia = p_data and mc.seller_id = c.seller_id);
    --     Reexibe quem voltou, com o cadastro intacto (nunca foi apagado):
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

revoke all on function reconciliar_carteira(date, boolean, boolean) from anon, authenticated;
grant execute on function reconciliar_carteira(date, boolean, boolean) to authenticated;
