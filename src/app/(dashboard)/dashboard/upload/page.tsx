import { AREAS } from '@/lib/config'

export default function UploadPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Upar Planilha</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Envie a planilha de cada área sempre que receber do Mercado Pago. O histórico completo é preservado.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AREAS.map((area) => (
          <div
            key={area.key}
            className="bg-white rounded-2xl border border-[#E5E7EB] p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${area.color}20` }}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: area.color }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111827]">{area.label}</p>
                <p className="text-[11px] text-[#6B7280]">Nenhum upload ainda</p>
              </div>
            </div>
            <label className="flex items-center justify-center gap-2 w-full text-sm font-medium text-[#10B981] border border-[#10B981]/30 bg-[#F0FDF4] rounded-xl py-2 cursor-pointer hover:bg-[#D1FAE5] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Selecionar arquivo
              <input type="file" accept=".xlsx,.csv" className="hidden" />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
