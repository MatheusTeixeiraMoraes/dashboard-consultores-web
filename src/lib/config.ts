// Configuração estática das cores e labels das áreas — as metas vivem no banco (pillar_config)
export const PILAR_META: Record<string, { color: string; abbr: string }> = {
  tpv:           { color: '#60a5fa', abbr: 'TPV' },
  net_churn:     { color: '#c084fc', abbr: 'NC' },
  acionaveis:    { color: '#fb923c', abbr: 'AC' },
  aderencia:     { color: '#2dd4bf', abbr: 'Agenda' },
  awareness:     { color: '#f472b6', abbr: 'Aware' },
  produtividade: { color: '#818cf8', abbr: 'Prod' },
}
