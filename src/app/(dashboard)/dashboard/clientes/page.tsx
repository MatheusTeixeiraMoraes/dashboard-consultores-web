import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { buscarTudo } from '@/lib/supabase/buscar-tudo'
import { carregarFichaMP } from '@/lib/supabase/ficha-mp'
import { redirect } from 'next/navigation'
import type { Cliente } from '@/lib/types'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  /* Gestão da carteira: escolhe o consultor dono ao cadastrar, reatribui, filtra
   * por consultor e geocodifica em massa. O líder entrou em 07/09/2026 junto com
   * as policies de escrita de `clientes` — antes disso a tela lhe oferecia os
   * botões e o banco recusava. Subir planilha NÃO está aqui: é `podeImportar`,
   * dentro do client. */
  const podeGerir = profile.role === 'admin' || profile.role === 'dono' || profile.role === 'lider'

  /* Três frentes independentes, disparadas juntas.
   *
   * Antes elas eram três `await` em fila e a tela pagava a SOMA: a carteira
   * inteira (duas ondas de rede), depois a data da Planilha Geral, depois as
   * fichas (mais duas ondas), depois os nomes. Nenhuma usava o resultado da
   * anterior — só a ficha depende da data, e essa dependência continua dentro
   * da própria frente. Agora o custo é o da frente mais lenta.
   */
  const [clientes, mp, nomesConsultores] = await Promise.all([
    // A RLS já escopa: consultor recebe só os seus (por nome); gestão recebe tudo.
    // `em_carteira`: só quem está na Planilha Geral atual. Quem saiu da carteira
    // fica no banco (com o cadastro), mas some do painel — a Planilha Geral manda.
    // Lista as colunas em vez de `select('*')`: a tela não usa created_at,
    // created_by nem updated_at, e cada lote de 1000 linhas vira payload.
    // `seller_nome` repete (mais de um cliente pode ter o mesmo nome) —
    // `seller_id` (unique em clientes) desempata e fecha a ordem TOTAL.
    buscarTudo<Cliente>(
      opcoes =>
        supabase
          .from('clientes')
          .select(
            'id, consultor_nome, seller_id, seller_nome, seller_telefone, seller_email, doc_tipo, cpf_cnpj, cidade, bairro, endereco_completo, lat, lng, status_atualizacao, coordenada_origem',
            opcoes,
          )
          .eq('em_carteira', true),
      [{ coluna: 'seller_nome', ascending: true }, 'seller_id'],
    ),

    // Ficha técnica vinda da Planilha Geral do MP: TPV, situação, prioridade,
    // crédito, segmento. A consulta mora em `lib/supabase/ficha-mp` porque o
    // Roteirizar filtra pelos mesmos eixos e precisa dela igual.
    carregarFichaMP(supabase),

    // Nomes de consultor para o datalist do cadastro manual (gestão).
    (async (): Promise<string[]> => {
      if (!podeGerir) return []
      const { data } = await supabase
        .from('profiles')
        .select('nome')
        .eq('role', 'consultor')
        .order('nome', { ascending: true })
      return [...new Set((data ?? []).map(p => p.nome).filter((n): n is string => !!n))]
    })(),
  ])

  const { dataMP, fichaTecnica } = mp

  return (
    <ClientesClient
      clientes={clientes}
      role={profile.role}
      meuNome={profile.nome || profile.email}
      nomesConsultores={nomesConsultores}
      fichaTecnica={fichaTecnica}
      dataMP={dataMP}
    />
  )
}
