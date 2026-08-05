// Os dois botões de ação que aparecem em toda lista de cliente: falar no
// WhatsApp e abrir no mapa.
//
// POR QUE UM COMPONENTE, E NÃO A CLASSE COPIADA EM CADA TELA
//
// Eles estavam em quatro telas com quatro tamanhos diferentes (15px solto,
// 18px com padding, 36px com borda cinza), e `whatsappUrl` estava reescrita em
// cinco arquivos. São os botões que a pessoa usa NA RUA, com o celular na mão:
// o alvo precisa ser o mesmo em todo lugar, e mudar isso não pode depender de
// alguém lembrar de mexer em cinco arquivos.
//
// 40px é o mínimo de alvo de toque recomendado (WCAG 2.5.5 pede 44 CSS px para
// AAA; 40 é o meio-termo que cabe na densidade destas listas sem quebrar o
// card). O ícone fica em 20px e o resto é área clicável — é a área que faz o
// dedo acertar, não o desenho.

const TAMANHO = 'w-10 h-10 grid place-items-center rounded-xl border active:scale-95 transition flex-shrink-0'

/**
 * Link do WhatsApp a partir de um telefone da planilha.
 *
 * Aceita qualquer sujeira ("+55 (81) 99961-2163", "81995658220") porque é assim
 * que os números chegam. Sem dígito nenhum devolve null, e quem chama esconde o
 * botão — melhor não oferecer do que abrir uma conversa vazia.
 *
 * O 55 é acrescentado quando falta: número brasileiro de 10-11 dígitos sem país
 * abriria o WhatsApp num contato inexistente.
 */
export function urlWhatsApp(telefone: string | null | undefined, texto?: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (!digitos) return null
  const comPais = digitos.startsWith('55') ? digitos : `55${digitos}`
  const base = `https://wa.me/${comPais}`
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}

export function BotaoWhatsApp({ telefone, nome, texto }: {
  telefone: string | null | undefined
  /** Nome do cliente — entra no rótulo lido por leitor de tela. */
  nome?: string
  /** Mensagem já preenchida na conversa. */
  texto?: string
}) {
  const url = urlWhatsApp(telefone, texto)
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      title="Abrir conversa no WhatsApp"
      aria-label={nome ? `Abrir conversa no WhatsApp com ${nome}` : 'Abrir conversa no WhatsApp'}
      className={`${TAMANHO} text-good bg-good-bg border-good/30 hover:bg-good/25`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
      </svg>
    </a>
  )
}

export function BotaoMapa({ lat, lng, nome }: {
  lat: number | null | undefined
  lng: number | null | undefined
  nome?: string
}) {
  if (lat == null || lng == null) return null
  return (
    <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
      target="_blank" rel="noopener noreferrer"
      title="Ver no Google Maps"
      aria-label={nome ? `Ver ${nome} no Google Maps` : 'Ver no Google Maps'}
      className={`${TAMANHO} text-gmaps bg-gmaps/10 border-gmaps/30 hover:bg-gmaps/20`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
      </svg>
    </a>
  )
}
