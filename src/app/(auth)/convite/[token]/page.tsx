import Image from 'next/image'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken, estadoDoConvite, MOTIVO } from '@/lib/convites'
import ConviteForm from './ConviteForm'

/**
 * Primeiro acesso do consultor. Rota PÚBLICA — quem chega aqui não tem sessão
 * (o middleware só protege `/dashboard/*`).
 *
 * A validação roda no servidor com service_role porque `convites_acesso` é
 * invisível para quem não é admin/dono: não existe policy de leitura para
 * anônimo, e é assim que tem que ser.
 */
export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const admin = createAdminClient()
  const { data: convite } = await admin
    .from('convites_acesso')
    .select('consultor_nome, id_carteira, expira_em, usado_em, revogado_em')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  const estado = convite ? estadoDoConvite(convite) : null
  const problema = !convite ? 'Link inválido.' : estado !== 'valido' ? MOTIVO[estado!] : null

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/inovva-logo.png"
            alt="Inovva Group"
            width={716}
            height={400}
            priority
            className="w-52 h-auto mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-ink">
            {problema ? 'Link indisponível' : 'Criar seu acesso'}
          </h1>
        </div>

        <div className="glass rounded-2xl p-7 border border-line">
          <div className="-mx-7 -mt-7 mb-6 h-1.5 rounded-t-2xl bg-linear-to-r from-marca-1 via-marca-2 to-marca-3" />

          {problema ? (
            <>
              <p className="text-sm text-ink-dim">{problema}</p>
              <Link
                href="/login"
                className="mt-5 block text-center bg-primary hover:bg-primary-dk text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                Ir para o login
              </Link>
            </>
          ) : (
            <ConviteForm
              token={token}
              consultorNome={convite!.consultor_nome}
              idCarteira={convite!.id_carteira}
            />
          )}
        </div>

        <p className="text-center text-[11px] text-ink-faint mt-6">Inovva Group © 2026</p>
      </div>
    </div>
  )
}
