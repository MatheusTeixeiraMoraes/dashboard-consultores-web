export default function GeralPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Ranking Geral</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Visão consolidada de todos os consultores</p>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
          </svg>
        </div>
        <p className="font-semibold text-[#111827]">Nenhum dado carregado ainda</p>
        <p className="text-sm text-[#6B7280] mt-1">Vá em <strong className="text-[#10B981]">Upar Planilha</strong> para começar.</p>
      </div>
    </div>
  )
}
