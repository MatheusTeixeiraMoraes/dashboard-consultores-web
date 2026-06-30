export default function ConsultorPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Visão Individual</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Performance detalhada por consultor</p>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <p className="font-semibold text-[#111827]">Nenhum consultor disponível</p>
        <p className="text-sm text-[#6B7280] mt-1">Faça upload das planilhas para visualizar.</p>
      </div>
    </div>
  )
}
