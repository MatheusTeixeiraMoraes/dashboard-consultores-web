export default function CompararPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Comparar Datas</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Compare a evolução entre dois períodos</p>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <p className="font-semibold text-[#111827]">Dados insuficientes</p>
        <p className="text-sm text-[#6B7280] mt-1">São necessários uploads em ao menos duas datas distintas.</p>
      </div>
    </div>
  )
}
