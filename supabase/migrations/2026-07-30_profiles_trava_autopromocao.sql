-- ============================================================
-- FECHA UMA ESCALADA DE PRIVILEGIO CONFIRMADA EM PRODUCAO (30/07/2026).
--
-- A policy "profiles: usuário atualiza o próprio" permite UPDATE na linha em que
-- id = auth.uid(). O que faltava era dizer QUAIS COLUNAS. Sem `with check` por
-- coluna, o dono da linha podia reescrever qualquer campo dela — inclusive
-- `role`. Testado com uma sessao de consultor comum, via PostgREST:
--
--   PATCH /rest/v1/profiles?id=eq.<meu_id>   {"role":"admin"}      -> 200, virou admin
--   PATCH ...                                {"nome":"<outro>"}    -> 200, passou a ver
--                                                                     a carteira do outro
--   PATCH ...                                {"id_carteira":"..."} -> 200, passou a ver
--                                                                     o score do outro
--
-- Os tres sao graves e o primeiro e total: com role=admin o consultor le e
-- escreve a base inteira, cria e apaga usuarios. Nao exige ferramenta especial —
-- a chave anon e publica (vai no bundle do site) e a sessao e a dele mesmo.
--
-- Um SEGUNDO caminho, achado ao testar a primeira versao desta correcao: um DONO
-- se promovia a admin sozinho, pelo mesmo PATCH na propria linha. Menos grave
-- (dono ja enxerga tudo), mas quebra a hierarquia declarada em
-- src/lib/types.ts::canManageUsers, onde so admin gerencia admin. Coberto abaixo
-- pela regra "ninguem altera o proprio papel".
--
-- Vale registrar o que NAO estava furado, porque isso mudou o diagnostico:
--   - a RLS de `clientes` esta correta: um consultor comum, sem escalar papel,
--     nao le, nao altera, nao apaga e nao cria cliente de outro (testado);
--   - a RLS de `profiles` ja barrava o dono de promover TERCEIROS a admin (403)
--     e de rebaixar um admin existente;
--   - anonimo com a chave publica nao le nem escreve nada em nenhuma das 8
--     tabelas (testado).
-- O buraco era so a propria linha em `profiles`.
--
-- POR QUE TRIGGER E NAO `with check` NA POLICY: a regra precisa comparar o valor
-- NOVO com o ANTIGO da mesma linha. Uma subconsulta a `profiles` dentro de uma
-- policy de `profiles` reentra na RLS e o Postgres aborta por recursao infinita.
-- O trigger enxerga OLD e NEW direto, sem consultar nada.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create or replace function profiles_impede_autopromocao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (aceite de convite, rotas administrativas do servidor) roda sem
  -- auth.uid(). Esse caminho ja tem gate de papel na aplicacao e precisa poder
  -- gravar nome/carteira/papel — e literalmente o que o convite faz.
  if auth.uid() is null then
    return new;
  end if;

  -- NINGUEM muda o PROPRIO papel. Nem dono, nem admin. Promocao e sempre ato de
  -- terceiro.
  --
  -- Esta regra e mais larga que a anterior de proposito: a primeira versao desta
  -- funcao liberava admin/dono geral, e com isso um DONO se promovia a admin
  -- sozinho (confirmado: PATCH no proprio id com {"role":"admin"} -> 200).
  -- Passar a admin importa porque so admin gerencia admin — o dono alcancaria
  -- criar e apagar administradores, inclusive o unico que existe.
  -- A RLS ja barra o dono de promover TERCEIROS a admin (403) e de rebaixar um
  -- admin; era so a propria linha que escapava.
  if old.id = auth.uid() and new.role is distinct from old.role then
    raise exception 'ninguem altera o proprio papel; peca a outro administrador';
  end if;

  -- Gestao continua editando quem ela ja podia editar. A tela de Usuarios usa a
  -- sessao do proprio admin/dono, entao passa por aqui.
  if get_my_role() in ('admin', 'dono') then
    return new;
  end if;

  -- Sobrou o usuario comum mexendo na propria linha: os campos que decidem
  -- PERMISSAO e ESCOPO viram somente-leitura para ele.
  --   role        -> quem ele e
  --   nome        -> de quem sao os clientes que ele ve (cliente_e_meu)
  --   id_carteira -> de quem e o score que ele ve
  --   ativo       -> se ele deveria estar dentro
  --   email       -> a chave que o aceite de convite usa para achar a conta
  if new.role        is distinct from old.role
     or new.nome        is distinct from old.nome
     or new.id_carteira is distinct from old.id_carteira
     or new.ativo       is distinct from old.ativo
     or new.email       is distinct from old.email then
    raise exception 'somente a gestao pode alterar papel, nome, carteira, status ou e-mail de um perfil';
  end if;

  return new;
end
$$;

drop trigger if exists profiles_impede_autopromocao_trg on profiles;

create trigger profiles_impede_autopromocao_trg
  before update on profiles
  for each row
  execute function profiles_impede_autopromocao();
