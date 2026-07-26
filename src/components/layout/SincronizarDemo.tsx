'use client'

import { useEffect, useRef } from 'react'
import { demoNoCookie } from '@/lib/demo/cookie'

/**
 * Recarrega a aba quando o modo demo mudou por fora dela.
 *
 * A casca do dashboard (selo "DADOS DEMO", botão da barra lateral) é desenhada
 * a partir do que o SERVIDOR decidiu no último carregamento completo. Só que
 * layout não re-renderiza em navegação client-side, então esse desenho envelhece
 * enquanto o cookie — que o servidor relê a cada requisição — já mudou.
 *
 * O caso concreto: duas abas abertas, o admin liga o modo demo numa delas. A
 * outra passa a receber dado fictício do servidor e continua sem selo nenhum,
 * dando a entender que é a operação real. O inverso também vale: fechar o modo
 * demo numa aba deixa a outra com o selo aceso sobre dado de produção.
 *
 * O roteamento das consultas não depende disto — esse já lê o cookie na hora
 * (ver `@/lib/demo/cookie`). Aqui é só a casca acompanhar a verdade.
 *
 * `habilitado` limita a checagem a quem pode usar o modo demo. Sem isso, um
 * cookie forjado por quem não é admin (servidor diz "não", cookie diz "sim",
 * para sempre) viraria um laço de recarregamento.
 */
export default function SincronizarDemo({
  renderizadoComDemo,
  habilitado,
}: {
  renderizadoComDemo: boolean
  habilitado: boolean
}) {
  const jaRecarregou = useRef(false)

  useEffect(() => {
    if (!habilitado) return

    const conferir = () => {
      if (jaRecarregou.current) return
      if (demoNoCookie() === renderizadoComDemo) return
      jaRecarregou.current = true
      window.location.reload()
    }

    conferir()
    window.addEventListener('focus', conferir)
    document.addEventListener('visibilitychange', conferir)
    return () => {
      window.removeEventListener('focus', conferir)
      document.removeEventListener('visibilitychange', conferir)
    }
  }, [renderizadoComDemo, habilitado])

  return null
}
