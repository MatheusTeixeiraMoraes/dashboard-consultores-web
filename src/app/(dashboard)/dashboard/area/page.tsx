export default function AreaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Detalhe por Área</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Análise individual de cada área de performance</p>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <p className="font-semibold text-[#111827]">Nenhum dado disponível</p>
        <p className="text-sm text-[#6B7280] mt-1">Faça upload das planilhas para visualizar.</p>
      </div>
    </div>
  )
}
