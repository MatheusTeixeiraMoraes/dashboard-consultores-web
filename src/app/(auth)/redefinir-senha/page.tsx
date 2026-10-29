'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createRecoveryClient } from '@/lib/supabase/client'

type Status = 'checking' | 'ready' | 'saving' | 'success' | 'invalid'

export default function RedefinirSenhaPage() {
  const [supabase] = useState(() => createRecoveryClient())
  const [status, setStatus] = useState<Status>('checking')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let recuperacaoRecebida = false
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const linkDeRecuperacao = hash.get('type') === 'recovery' && !!hash.get('access_token')
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        recuperacaoRecebida = true
        setStatus('ready')
        window.history.replaceState(null, '', window.location.pathname)
      }
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError || !data.session || (!linkDeRecuperacao && !recuperacaoRecebida)) {
        setStatus('invalid')
        return
      }
      setStatus('ready')
      window.history.replaceState(null, '', window.location.pathname)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function salvarSenha(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não coincidem.')
      return
    }

    setStatus('saving')
    const { error: updateError } = await supabase.auth.updateUser({ password: senha })
    if (updateError) {
      setErro('Não foi possível atualizar a senha. Solicite um novo link e tente novamente.')
      setStatus('ready')
      return
    }

    await supabase.auth.signOut({ scope: 'local' })
    setSenha('')
    setConfirmacao('')
    setStatus('success')
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-ink">Dashboard de Consultores</h1>
          <p className="text-sm text-ink-muted mt-1">Inovva Group</p>
        </div>
        <div className="glass rounded-2xl p-7 border border-line">
          <div className="-mx-7 -mt-7 mb-6 h-1.5 rounded-t-2xl bg-linear-to-r from-marca-1 via-marca-2 to-marca-3" />

          {status === 'checking' && (
            <p role="status" className="text-sm text-ink-muted">Validando o link de redefinição...</p>
          )}

          {status === 'invalid' && (
            <div>
              <h2 className="text-base font-semibold text-ink mb-2">Link inválido ou expirado</h2>
              <p className="text-sm text-ink-muted mb-5">Peça a um administrador para enviar uma nova redefinição de senha.</p>
              <Link href="/login" className="block text-center w-full bg-primary hover:bg-primary-dk text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">Voltar ao login</Link>
            </div>
          )}

          {(status === 'ready' || status === 'saving') && (
            <>
              <h2 className="text-base font-semibold text-ink mb-2">Defina sua nova senha</h2>
              <p className="text-sm text-ink-muted mb-5">Use pelo menos 8 caracteres.</p>
              <form onSubmit={salvarSenha} className="space-y-4">
                <div>
                  <label htmlFor="nova-senha" className="block text-xs font-medium text-ink-muted mb-1.5">Nova senha</label>
                  <input id="nova-senha" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={e => setSenha(e.target.value)} className="w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label htmlFor="confirmar-senha" className="block text-xs font-medium text-ink-muted mb-1.5">Confirme a nova senha</label>
                  <input id="confirmar-senha" type="password" autoComplete="new-password" minLength={8} required value={confirmacao} onChange={e => setConfirmacao(e.target.value)} className="w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                {erro && <p role="alert" className="text-xs text-bad bg-bad/10 border border-bad/20 rounded-xl px-3.5 py-2.5">{erro}</p>}
                <button type="submit" disabled={status === 'saving'} className="w-full bg-primary hover:bg-primary-dk disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                  {status === 'saving' ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}

          {status === 'success' && (
            <div>
              <h2 className="text-base font-semibold text-ink mb-2">Senha atualizada</h2>
              <p className="text-sm text-ink-muted mb-5">Sua senha foi alterada. Entre novamente com a nova senha.</p>
              <Link href="/login" className="block text-center w-full bg-primary hover:bg-primary-dk text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">Ir para o login</Link>
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-ink-faint mt-6">Inovva Group © 2026</p>
      </div>
    </div>
  )
}
