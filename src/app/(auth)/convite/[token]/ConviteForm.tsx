'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SENHA_MIN } from '@/lib/convites'
import { aceitarConvite } from './acoes'

const CAMPO =
  'w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition'

export default function ConviteForm({
  token, consultorNome, idCarteira,
}: {
  token: string
  consultorNome: string
  idCarteira: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    // Conferido aqui só para o consultor não perder o convite por um erro de
    // digitação: o link é de uso único, e um aceite recusado no servidor por
    // senha divergente teria devolvido a reserva, mas com um susto à toa.
    if (senha !== confirma) { setErro('As duas senhas não são iguais'); return }

    setEnviando(true)
    const r = await aceitarConvite({ token, email, senha })

    if (!r.ok) { setErro(r.error ?? 'Não foi possível criar o acesso'); setEnviando(false); return }

    // Conta pronta: já entra, em vez de mandar para o login digitar de novo o
    // que acabou de escolher.
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: r.email!, password: senha })

    if (error) {
      // A conta FOI criada; só o login automático falhou. Manda para o login em
      // vez de sugerir que deu tudo errado — o convite já foi consumido.
      router.push('/login?criado=1')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {/* O nome não é editável de propósito: ele é o vínculo com a planilha e
          veio do convite. Deixar digitar seria repor exatamente o erro que esta
          tela existe para eliminar. */}
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1.5">Você é</label>
        <div className="bg-card-2 border border-line rounded-xl px-3.5 py-2.5">
          <p className="text-sm font-semibold text-ink">{consultorNome}</p>
          {idCarteira && <p className="text-[11px] text-ink-muted mt-0.5">Carteira {idCarteira}</p>}
        </div>
        <p className="text-[11px] text-ink-faint mt-1.5">
          Se este não é você, avise quem enviou o link antes de continuar.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1.5" htmlFor="email">
          Seu e-mail
        </label>
        <input
          id="email" type="email" autoComplete="email" required className={CAMPO}
          value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1.5" htmlFor="senha">
          Crie uma senha
        </label>
        <input
          id="senha" type="password" autoComplete="new-password" required minLength={SENHA_MIN}
          className={CAMPO} value={senha} onChange={e => setSenha(e.target.value)}
          placeholder={`Mínimo ${SENHA_MIN} caracteres`}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1.5" htmlFor="confirma">
          Repita a senha
        </label>
        <input
          id="confirma" type="password" autoComplete="new-password" required minLength={SENHA_MIN}
          className={CAMPO} value={confirma} onChange={e => setConfirma(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {erro && (
        <p className="text-xs text-bad bg-bad/10 border border-bad/20 rounded-xl px-3.5 py-2.5">{erro}</p>
      )}

      <button
        type="submit" disabled={enviando}
        className="w-full bg-primary hover:bg-primary-dk disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors mt-2"
      >
        {enviando ? 'Criando acesso...' : 'Criar meu acesso'}
      </button>
    </form>
  )
}
