export default function CompararPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-[#0f172a] mb-6">Comparar Datas</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-[#c7d0db] p-8 text-center text-[#525c6b]">
        <p className="text-4xl mb-3">📅</p>
        <p className="font-medium">Dados insuficientes para comparar.</p>
        <p className="text-sm mt-1">São necessários uploads em ao menos duas datas distintas.</p>
      </div>
    </div>
  )
}
