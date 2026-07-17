// Configuração estática das cores e labels das áreas — as metas vivem no banco (pillar_config)
export const PILAR_META: Record<string, { color: string; abbr: string }> = {
  tpv:           { color: 'var(--color-pilar-tpv)', abbr: 'TPV' },
  net_churn:     { color: 'var(--color-pilar-net-churn)', abbr: 'NC' },
  acionaveis:    { color: 'var(--color-pilar-acionaveis)', abbr: 'AC' },
  aderencia:     { color: 'var(--color-pilar-aderencia)', abbr: 'Agenda' },
  awareness:     { color: 'var(--color-pilar-awareness)', abbr: 'Aware' },
  produtividade: { color: 'var(--color-pilar-produtividade)', abbr: 'Prod' },
}
