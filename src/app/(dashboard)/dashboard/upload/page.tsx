import { AREAS } from '@/lib/config'

export default function UploadPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-[#0f172a] mb-2">Upar Planilha</h1>
      <p className="text-sm text-[#525c6b] mb-6">
        Envie a planilha de cada área separadamente (.xlsx ou .csv) sempre que receber do Mercado Pago.
        Cada upload é registrado com data/hora e o histórico completo é preservado.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AREAS.map((area) => (
          <div
            key={area.key}
            className="bg-white rounded-2xl shadow-sm border border-[#c7d0db] p-5"
            style={{ borderLeft: `4px solid ${area.color}` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: area.color }}
              >
                {area.abbr}
              </span>
              <h3 className="text-sm font-semibold text-[#0f172a]">{area.label}</h3>
            </div>
            <p className="text-xs text-[#525c6b] mb-4">Nenhum upload ainda.</p>
            <label className="block w-full text-center text-sm font-medium text-[#3b82f6] border border-[#3b82f6] rounded-xl py-2 cursor-pointer hover:bg-[#eff6ff] transition-colors">
              Selecionar arquivo
              <input type="file" accept=".xlsx,.csv" className="hidden" />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
