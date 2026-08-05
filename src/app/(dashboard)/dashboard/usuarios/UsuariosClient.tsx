'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/lib/types'
import { canManageUsers } from '@/lib/types'
import { gerarLinkAcesso, revogarLink, excluirLink, listarConsultoresDaPlanilha } from './convites'
import { entrarNaConta } from './delegacao'
import type { ConsultorPlanilha } from './convites'
import type { ConviteLinha } from './page'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador', dono: 'Dono', lider: 'Líder', consultor: 'Consultor',
}
const ROLE_COLOR: Record<UserRole, string> = {
  admin:     'bg-purple-500/15 text-purple-300',
  dono:      'bg-good/15 text-good',
  lider:     'bg-primary/15 text-primary-lt',
  consultor: 'bg-gray-500/15 text-gray-300',
}

const EMPTY_FORM = { email: '', nome: '', role: 'consultor' as UserRole, id_carteira: '', senha: '' }

export default function UsuariosClient({ usuarios, myRole, myId, convites }: {
  usuarios: Profile[]
  myRole: UserRole
  myId: string
  convites: ConviteLinha[]
}) {
  const [lista, setLista] = useState(usuarios)

  // link de acesso
  const [consultores, setConsultores] = useState<ConsultorPlanilha[] | null>(null)
  const [carregandoCons, setCarregandoCons] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [buscaCons, setBuscaCons] = useState('')
  const [gerando, setGerando] = useState<string | null>(null)
  const [linkErr, setLinkErr] = useState<string | null>(null)
  /** Link recém-gerado. Só existe aqui e agora: o banco guarda o hash. */
  const [linkPronto, setLinkPronto] = useState<{ nome: string; url: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [listaConvites, setListaConvites] = useState(convites)
  /** Aba do modal: link de consultor (lista) ou de líder (nome digitado). */
  const [tipoLink, setTipoLink] = useState<'consultor' | 'lider'>('consultor')
  const [nomeLider, setNomeLider] = useState('')
  const [confirmarExcluirLink, setConfirmarExcluirLink] = useState<string | null>(null)

  /**
   * Gera o link. Serve para os dois casos, que diferem só na origem do nome:
   *
   *  - consultor: escolhido na lista das planilhas, e leva `id_carteira` junto,
   *    que é o que faz a RLS casar as linhas dele;
   *  - líder: nome digitado, sem carteira — líder não tem carteira de pontuação,
   *    e o papel dele lê a operação inteira.
   */
  async function gerar(alvo: { nome: string; id_carteira: string | null; role: UserRole }) {
    setGerando(alvo.nome)
    setLinkErr(null)
    const r = await gerarLinkAcesso({
      consultor_nome: alvo.nome,
      id_carteira: alvo.id_carteira,
      role: alvo.role,
    })
    if (r.ok && r.token) {
      // Monta a URL com a origem em que o gestor ESTÁ navegando, em vez de uma
      // variável de ambiente: assim o link sai com o mesmo domínio que ele usa
      // (produção, preview ou localhost) sem depender de configuração.
      setLinkPronto({ nome: alvo.nome, url: `${window.location.origin}/convite/${r.token}` })
      setCopiado(false)
      setNomeLider('')
      setListaConvites(prev => [{
        id: `novo-${r.token!.slice(0, 8)}`,
        consultor_nome: alvo.nome,
        id_carteira: alvo.id_carteira,
        role: alvo.role,
        criado_em: new Date().toISOString(),
        expira_em: r.expira_em!,
        usado_em: null,
        revogado_em: null,
      }, ...prev])
    } else {
      setLinkErr(r.error ?? 'Não foi possível gerar o link')
    }
    setGerando(null)
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      setLinkErr('Não consegui copiar sozinho — selecione o link e copie na mão.')
    }
  }

  async function handleRevogar(id: string) {
    const r = await revogarLink(id)
    if (r.ok) {
      setListaConvites(prev => prev.map(c =>
        c.id === id ? { ...c, revogado_em: new Date().toISOString() } : c))
    } else {
      setLinkErr(r.error ?? 'Não foi possível cancelar')
    }
  }

  /**
   * Apaga o registro do link. Cancelar MARCA como cancelado e mantém na lista;
   * isto some com a linha — é para arrumar o histórico, não para cortar acesso.
   * Num link pendente também corta, e a confirmação diz isso.
   */
  async function handleExcluir(id: string) {
    setConfirmarExcluirLink(null)
    const r = await excluirLink(id)
    if (r.ok) setListaConvites(prev => prev.filter(c => c.id !== id))
    else setLinkErr(r.error ?? 'Não foi possível excluir')
  }

  /**
   * Busca a lista só quando o modal abre. Ela varre a base de clientes inteira,
   * e carregá-la junto com a tela custava ~3s todas as vezes — inclusive para
   * quem só veio conferir um usuário.
   */
  async function abrirModalLink() {
    setShowLink(true); setLinkErr(null); setLinkPronto(null); setBuscaCons('')
    if (consultores) return          // já carregada nesta sessão de tela
    setCarregandoCons(true)
    const r = await listarConsultoresDaPlanilha()
    if (r.ok && r.consultores) setConsultores(r.consultores)
    else setLinkErr(r.error ?? 'Não consegui carregar a lista de consultores')
    setCarregandoCons(false)
  }

  const consultoresFiltrados = (consultores ?? []).filter(c =>
    c.nome.toLowerCase().includes(buscaCons.toLowerCase().trim()))

  // edição inline
  const [editing, setEditing]   = useState<string | null>(null)
  const [saving, setSaving]     = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Profile>>({})
  const [editErr, setEditErr]   = useState<string | null>(null)

  // exclusão com confirmação inline
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [delErr, setDelErr]         = useState<string | null>(null)

  // modal de criação
  const [showModal, setShowModal] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [creating, setCreating]   = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const rolesDisponiveis: UserRole[] = myRole === 'admin'
    ? ['admin', 'dono', 'lider', 'consultor']
    : ['lider', 'consultor']

  // ── edição ──────────────────────────────────────────────────
  function startEdit(u: Profile) {
    setEditing(u.id)
    setEditForm({ nome: u.nome, role: u.role, id_carteira: u.id_carteira ?? '' })
  }

  async function saveEdit(u: Profile) {
    setSaving(u.id)
    setEditErr(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      // trim: `nome` é a chave que casa com a planilha, e um espaço sobrando
      // muda o que o índice único enxerga.
      .update({
        nome: (editForm.nome ?? '').trim(),
        role: editForm.role,
        id_carteira: editForm.id_carteira?.trim() || null,
      })
      .eq('id', u.id)
      .select()
      .single()

    // O `error` era ignorado aqui. Com o índice único de nome isso viraria a
    // pior falha possível: a edição fecha, nada é salvo e ninguém é avisado.
    if (error) {
      setEditErr(
        error.code === '23505'
          ? 'Já existe um consultor com este nome. Use o nome exato da planilha.'
          : error.message,
      )
      setSaving(null)
      return
    }
    if (data) setLista(prev => prev.map(p => p.id === u.id ? data as Profile : p))
    setSaving(null)
    setEditing(null)
  }

  /**
   * Liga/desliga o acesso sem apagar a conta.
   *
   * Até agora a única forma de cortar alguém era Excluir, que apaga o usuário
   * em auth.users e não tem volta. `ativo` já existia na tabela e não fazia
   * nada; virou gate de verdade em `get_my_role()`, então este botão passou a
   * revogar de fato — o desativado perde toda a RLS e cai na tela de aviso.
   */
  /**
   * Abre o painel como outra pessoa.
   *
   * Em caso de sucesso a action termina em `redirect`, então nada aqui embaixo
   * roda — só tratamos a recusa (sem alçada sobre aquele papel, conta
   * desativada, sessão expirada).
   */
  async function entrar(u: Profile) {
    setSaving(u.id)
    setEditErr(null)
    const r = await entrarNaConta(u.id)
    if (r && !r.ok) setEditErr(r.error ?? 'Não foi possível entrar nesta conta')
    setSaving(null)
  }

  async function alternarAtivo(u: Profile) {
    setSaving(u.id)
    setEditErr(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .update({ ativo: !u.ativo })
      .eq('id', u.id)
      .select()
      .single()
    if (error) setEditErr(error.message)
    else if (data) setLista(prev => prev.map(p => p.id === u.id ? data as Profile : p))
    setSaving(null)
  }

  // ── exclusão ────────────────────────────────────────────────
  async function handleDelete(userId: string) {
    setDeleting(userId)
    setDelErr(null)
    try {
      const res = await fetch('/api/usuarios/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).then(r => r.json())
      if (res.ok) {
        setLista(prev => prev.filter(u => u.id !== userId))
        setConfirmDel(null)
      } else {
        setDelErr(res.error ?? 'Erro ao excluir')
      }
    } catch {
      setDelErr('Erro de comunicação com o servidor')
    }
    setDeleting(null)
  }

  // ── criação ─────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateErr(null)
    try {
      const res = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      }).then(r => r.json())
      if (res.ok && res.profile) {
        setLista(prev => [...prev, res.profile as Profile].sort((a, b) => a.nome.localeCompare(b.nome)))
        setShowModal(false)
        setCreateForm(EMPTY_FORM)
      } else {
        setCreateErr(typeof res.error === 'string' ? res.error : 'Erro ao criar usuário')
      }
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Erro de comunicação com o servidor')
    }
    setCreating(false)
  }

  return (
    <>
      <div>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">Usuários</h1>
            <p className="text-sm text-ink-muted mt-0.5">
              {lista.length} usuário{lista.length !== 1 ? 's' : ''} cadastrado{lista.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Caminho recomendado: o gestor escolhe o nome na planilha e o
                vínculo nasce certo. O "Novo Usuário" ao lado continua para os
                casos que não vêm de planilha (outro admin, um líder). */}
            <button
              onClick={abrirModalLink}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dk text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Gerar link de acesso
            </button>
            <button
              onClick={() => { setShowModal(true); setCreateErr(null); setCreateForm(EMPTY_FORM) }}
              className="flex items-center gap-2 text-ink-dim border border-line hover:bg-card-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Novo Usuário
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl border border-line overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2">
                <th className="text-left px-5 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Nome / E-mail</th>
                <th className="text-left px-5 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Cargo</th>
                <th className="text-left px-5 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">ID Carteira</th>
                <th className="text-left px-5 py-3 font-semibold text-ink-muted text-xs uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.map(u => {
                const isMe    = u.id === myId
                const canEdit = !isMe && canManageUsers(myRole, u.role)
                const isEditing  = editing === u.id
                const isConfirm  = confirmDel === u.id
                const isDel      = deleting === u.id

                return (
                  <tr key={u.id} className="hover:bg-card-2 transition-colors">
                    {/* Nome / e-mail */}
                    <td className="px-5 py-3.5">
                      {isEditing ? (
                        <input
                          className="border border-field-line rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                          value={editForm.nome ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                          placeholder="Nome completo"
                        />
                      ) : (
                        <div>
                          <p className="font-medium text-ink">
                            {u.nome || '—'} {isMe && <span className="text-xs text-ink-muted">(você)</span>}
                            {!u.ativo && (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-warn-bg text-warn align-middle">
                                Desativado
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-ink-muted">{u.email}</p>
                        </div>
                      )}
                    </td>

                    {/* Cargo */}
                    <td className="px-5 py-3.5">
                      {isEditing ? (
                        <select
                          className="border border-field-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          value={editForm.role}
                          onChange={e => setEditForm(f => ({ ...f, role: e.target.value as UserRole }))}
                        >
                          {rolesDisponiveis.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[u.role]}`}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      )}
                    </td>

                    {/* ID Carteira */}
                    <td className="px-5 py-3.5">
                      {isEditing ? (
                        <input
                          className="border border-field-line rounded-lg px-2 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-primary"
                          value={editForm.id_carteira ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, id_carteira: e.target.value }))}
                          placeholder="ex: 12345"
                        />
                      ) : (
                        <span className="text-ink-muted">{u.id_carteira || '—'}</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-3.5">
                      {canEdit && (
                        isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(u)}
                              disabled={saving === u.id}
                              className="text-xs font-medium text-white bg-primary hover:bg-primary-dk px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                            >
                              {saving === u.id ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              onClick={() => { setEditing(null); setEditErr(null) }}
                              className="text-xs font-medium text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg border border-line transition-colors"
                            >
                              Cancelar
                            </button>
                            {editErr && <span className="text-[11px] text-bad">{editErr}</span>}
                          </div>
                        ) : isConfirm ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-bad">Excluir?</span>
                            <button
                              onClick={() => handleDelete(u.id)}
                              disabled={isDel}
                              className="text-xs font-medium text-white bg-bad hover:bg-bad-dk px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60"
                            >
                              {isDel ? '...' : 'Sim'}
                            </button>
                            <button
                              onClick={() => { setConfirmDel(null); setDelErr(null) }}
                              className="text-xs font-medium text-ink-muted hover:text-ink px-2.5 py-1 rounded-lg border border-line transition-colors"
                            >
                              Não
                            </button>
                            {delErr && <span className="text-xs text-bad">{delErr}</span>}
                          </div>
                        ) : (
                          <div className="flex gap-3 items-center flex-wrap">
                            <button
                              onClick={() => startEdit(u)}
                              className="text-xs font-medium text-primary hover:text-primary-dk transition-colors"
                            >
                              Editar
                            </button>
                            {/* Corta o acesso sem destruir a conta — antes disto
                                a única saída era Excluir, que apaga o usuário em
                                auth.users e não tem volta. */}
                            <button
                              onClick={() => alternarAtivo(u)}
                              disabled={saving === u.id}
                              className={`text-xs font-medium transition-colors disabled:opacity-60 ${
                                u.ativo ? 'text-warn hover:text-ink' : 'text-good hover:text-ink'
                              }`}
                            >
                              {saving === u.id ? '...' : u.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                            {/* Só faz sentido em conta ativa: desativado tem
                                get_my_role() nulo e o painel viria todo vazio,
                                dando a impressão de que algo quebrou. */}
                            {u.ativo && (
                              <button
                                onClick={() => entrar(u)}
                                disabled={saving === u.id}
                                className="text-xs font-medium text-ink-dim hover:text-ink transition-colors disabled:opacity-60"
                                title={`Abrir o painel exatamente como ${u.nome || u.email} o vê`}
                              >
                                {saving === u.id ? '...' : 'Entrar na conta'}
                              </button>
                            )}
                            <button
                              onClick={() => { setConfirmDel(u.id); setDelErr(null) }}
                              className="text-xs font-medium text-bad hover:text-bad-dk transition-colors"
                            >
                              Excluir
                            </button>
                            {editErr && saving !== u.id && (
                              <span className="text-[11px] text-bad">{editErr}</span>
                            )}
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}

              {lista.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-ink-muted text-sm">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Links gerados. Mostra o estado, nunca o link: o token não fica
            guardado em lugar nenhum depois que a janela fecha. */}
        {listaConvites.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-ink mb-1">Links de acesso</h2>
            <p className="text-xs text-ink-muted mb-3">
              Por segurança o link só aparece uma vez, na hora de gerar. Se perdeu, gere outro.
            </p>
            <div className="glass rounded-2xl border border-line divide-y divide-line">
              {listaConvites.map(c => {
                const expirado = new Date(c.expira_em) <= new Date()
                const estado = c.revogado_em ? 'Cancelado'
                  : c.usado_em ? 'Usado'
                  : expirado ? 'Expirou'
                  : 'Aguardando'
                const cor = c.revogado_em ? 'bg-card-2 text-ink-muted'
                  : c.usado_em ? 'bg-good-bg text-good'
                  : expirado ? 'bg-warn-bg text-warn'
                  : 'bg-primary/15 text-primary-lt'
                const pendente = !c.revogado_em && !c.usado_em && !expirado
                // Link recém-gerado ainda não tem o id do banco (o insert não
                // devolve): sem id, não há o que cancelar nem excluir. Sai da
                // regra ao recarregar a tela.
                const semId = c.id.startsWith('novo-')
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {c.consultor_nome}
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${ROLE_COLOR[c.role] ?? 'bg-card-2 text-ink-muted'}`}>
                          {ROLE_LABEL[c.role] ?? c.role}
                        </span>
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {c.id_carteira ? `Carteira ${c.id_carteira} · ` : ''}
                        {pendente
                          ? `vence ${new Date(c.expira_em).toLocaleDateString('pt-BR')}`
                          : `gerado ${new Date(c.criado_em).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${cor}`}>
                        {estado}
                      </span>
                      {confirmarExcluirLink === c.id ? (
                        /* A confirmação diz o que se perde em cada caso: num
                           link pendente, excluir também derruba o acesso; num
                           já usado, o que some é a trilha de quem entrou. */
                        <span className="flex items-center gap-2 text-[11px]">
                          <span className="text-bad">
                            {pendente ? 'Excluir invalida o link. Confirma?' : 'Some do histórico. Confirma?'}
                          </span>
                          <button onClick={() => handleExcluir(c.id)}
                            className="bg-bad hover:bg-bad-dk text-white font-semibold px-2 py-1 rounded-md">Sim</button>
                          <button onClick={() => setConfirmarExcluirLink(null)}
                            className="text-ink-muted hover:text-ink px-1">Não</button>
                        </span>
                      ) : (
                        !semId && (
                          <>
                            {pendente && (
                              <button
                                onClick={() => handleRevogar(c.id)}
                                className="text-xs font-medium text-warn hover:underline transition-colors"
                                title="Corta o acesso e mantém o registro na lista"
                              >
                                Cancelar
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmarExcluirLink(c.id)}
                              className="text-xs font-medium text-bad hover:underline transition-colors"
                              title="Apaga o registro deste link"
                            >
                              Excluir
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal do link de acesso */}
      {showLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="glass-blur rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Gerar link de acesso</h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  {tipoLink === 'consultor'
                    ? 'Escolha pelo nome da planilha — o vínculo vai junto no link.'
                    : 'Líder não sai da planilha: escreva o nome como ele deve aparecer no painel.'}
                </p>
              </div>
              <button onClick={() => setShowLink(false)} className="text-ink-faint hover:text-ink-dim transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {linkPronto ? (
              <div className="px-6 py-5">
                <p className="text-sm text-ink mb-1">
                  Link de <span className="font-semibold">{linkPronto.nome}</span>
                </p>
                <p className="text-xs text-ink-muted mb-3">
                  Copie agora e mande para essa pessoa. Ele não vai aparecer de novo.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={linkPronto.url}
                    onFocus={e => e.currentTarget.select()}
                    className="flex-1 bg-field border border-field-line rounded-xl px-3 py-2 text-xs text-ink font-mono"
                  />
                  <button
                    onClick={() => copiar(linkPronto.url)}
                    className="bg-primary hover:bg-primary-dk text-white text-sm font-medium px-4 rounded-xl transition-colors"
                  >
                    {copiado ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                {linkErr && <p className="text-xs text-bad mt-2">{linkErr}</p>}
                <div className="flex gap-3 pt-5">
                  <button
                    onClick={() => { setLinkPronto(null); setCopiado(false) }}
                    className="flex-1 text-sm font-medium text-ink-dim border border-line rounded-xl py-2.5 hover:bg-card-2 transition-colors"
                  >
                    Gerar para outro
                  </button>
                  <button
                    onClick={() => setShowLink(false)}
                    className="flex-1 bg-primary hover:bg-primary-dk text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Escolha do cargo. Consultor sai da lista das planilhas
                    porque o link precisa levar o par nome+carteira — é ele que
                    faz a RLS entregar as linhas certas. Líder não está em
                    planilha nenhuma e não tem carteira, então ali o nome é
                    digitado. */}
                <div className="px-6 pt-4 flex gap-0.5 bg-transparent">
                  {(['consultor', 'lider'] as const).map(t => (
                    <button key={t} onClick={() => { setTipoLink(t); setLinkErr(null) }}
                      className={`flex-1 text-sm font-medium py-2 rounded-xl transition-colors ${
                        tipoLink === t ? 'bg-primary text-white' : 'text-ink-muted hover:bg-card-2'
                      }`}>
                      {t === 'consultor' ? 'Consultor' : 'Líder'}
                    </button>
                  ))}
                </div>

                {tipoLink === 'lider' ? (
                  <div className="px-6 pt-4 pb-5">
                    <label className="text-xs font-semibold text-ink-muted block mb-1.5">Nome do líder</label>
                    <input
                      autoFocus
                      value={nomeLider}
                      onChange={e => setNomeLider(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && nomeLider.trim()) {
                          gerar({ nome: nomeLider.trim(), id_carteira: null, role: 'lider' })
                        }
                      }}
                      placeholder="Ex.: Maria Souza"
                      className="w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">
                      O líder enxerga a operação inteira e não tem carteira própria. Se já existir
                      um usuário com este nome, o link serve para ele redefinir a senha — e o cargo
                      passa a ser líder.
                    </p>
                    {linkErr && <p className="text-xs text-bad mt-2">{linkErr}</p>}
                    <button
                      onClick={() => gerar({ nome: nomeLider.trim(), id_carteira: null, role: 'lider' })}
                      disabled={!nomeLider.trim() || gerando !== null}
                      className="w-full mt-4 bg-primary hover:bg-primary-dk disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      {gerando ? 'Gerando…' : 'Gerar link de líder'}
                    </button>
                  </div>
                ) : (
                <div className="px-6 pt-4 pb-3">
                  <input
                    autoFocus
                    value={buscaCons}
                    onChange={e => setBuscaCons(e.target.value)}
                    placeholder="Buscar consultor..."
                    className="w-full bg-field border border-field-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {linkErr && <p className="text-xs text-bad mt-2">{linkErr}</p>}
                </div>
                )}
                <div className={`overflow-y-auto px-3 pb-4 ${tipoLink === 'lider' ? 'hidden' : ''}`}>
                  {carregandoCons && (
                    <p className="px-3 py-8 text-center text-sm text-ink-muted">
                      Lendo as planilhas...
                    </p>
                  )}
                  {consultoresFiltrados.map(c => (
                    <div key={c.nome} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-card-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{c.nome}</p>
                        <p className="text-[11px] text-ink-muted">
                          {c.qtdClientes > 0
                            ? `${c.qtdClientes} cliente${c.qtdClientes !== 1 ? 's' : ''}`
                            : 'nenhum cliente nesta grafia'}
                          {' · '}
                          {c.id_carteira ? `carteira ${c.id_carteira}` : 'sem carteira de pontuação'}
                          {c.temUsuario && ' · já tem acesso'}
                        </p>
                        {/* Os dois avisos existem porque a mesma pessoa aparece
                            escrita de dois jeitos nas planilhas, e a escolha
                            errada dá acesso pela metade. */}
                        {c.carteiraRepetida && (
                          <p className="text-[11px] text-warn mt-0.5">
                            Outra grafia usa esta mesma carteira — confira qual é a correta.
                          </p>
                        )}
                        {!c.id_carteira && c.qtdClientes > 0 && (
                          <p className="text-[11px] text-warn mt-0.5">
                            Vê os clientes, mas não verá o próprio desempenho: este nome não
                            aparece na planilha de pontuação.
                          </p>
                        )}
                        {c.id_carteira && c.qtdClientes === 0 && (
                          <p className="text-[11px] text-warn mt-0.5">
                            Vê o desempenho, mas a carteira virá vazia: nenhum cliente está
                            gravado com esta grafia.
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => gerar({ nome: c.nome, id_carteira: c.id_carteira, role: 'consultor' })}
                        disabled={gerando !== null}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 disabled:opacity-60 ${
                          c.temUsuario
                            ? 'text-ink-dim border border-line hover:bg-card-2'
                            : 'text-white bg-primary hover:bg-primary-dk'
                        }`}
                      >
                        {gerando === c.nome ? '...' : c.temUsuario ? 'Nova senha' : 'Gerar link'}
                      </button>
                    </div>
                  ))}
                  {!carregandoCons && consultores && consultoresFiltrados.length === 0 && (
                    <p className="px-3 py-8 text-center text-sm text-ink-muted">
                      Nenhum consultor com esse nome nas planilhas.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de criação */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="glass-blur rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-line flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Novo Usuário</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-ink-faint hover:text-ink-dim transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-dim mb-1.5">Nome completo</label>
                <input
                  required
                  className="w-full border border-field-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={createForm.nome}
                  onChange={e => setCreateForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-dim mb-1.5">E-mail</label>
                <input
                  required
                  type="email"
                  className="w-full border border-field-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="joao@email.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-dim mb-1.5">Cargo</label>
                  <select
                    className="w-full border border-field-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={createForm.role}
                    onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  >
                    {rolesDisponiveis.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-dim mb-1.5">ID Carteira <span className="font-normal text-ink-faint">(opcional)</span></label>
                  <input
                    className="w-full border border-field-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={createForm.id_carteira}
                    onChange={e => setCreateForm(f => ({ ...f, id_carteira: e.target.value }))}
                    placeholder="ex: 12345"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-dim mb-1.5">Senha temporária</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  className="w-full border border-field-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={createForm.senha}
                  onChange={e => setCreateForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              {createErr && (
                <p className="text-sm text-bad bg-bad-bg rounded-xl px-3 py-2">{createErr}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-primary hover:bg-primary-dk text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-60"
                >
                  {creating ? 'Criando...' : 'Criar usuário'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 text-sm font-medium text-ink-muted border border-line rounded-xl hover:bg-card-2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
