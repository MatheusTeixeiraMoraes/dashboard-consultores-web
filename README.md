This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Região da função (`vercel.json` → `regions: ["pdx1"]`)

> Este texto morava dentro do `vercel.json`, numa chave `"//"` fazendo as vezes de comentário.
> A Vercel **recusa** o arquivo com propriedade fora do schema (`should NOT have additional
> property "//"`) e o deploy de produção falha inteiro. JSON não tem comentário — a explicação
> mora aqui, e o arquivo fica só com o que o schema aceita.

A função deve ficar **colada no banco**, não perto do usuário. O padrão da Vercel é `iad1`
(Virgínia) em todo projeto novo, e medindo produção o header vinha
`X-Vercel-Id: gru1::iad1::...` (borda em SP, função na Virgínia).

O banco **não está no Brasil**: `db.<ref>.supabase.co` resolve para `2600:1f14:131e:fd00:...`,
e o `ip-ranges.json` oficial da AWS coloca `2600:1f14::/34` em `us-west-2` (Oregon). Confere com
a medição: uma consulta real do Brasil leva ~265 ms, dos quais o servidor gasta 32 ms
(`x-envoy-upstream-service-time`) — o resto é distância. `pdx1` é `us-west-2`.

**CUIDADO: não trocar para `gru1` "porque o usuário é brasileiro".** O `CF-RAY ...-GRU` que
aparece no host da API é só o PoP da Cloudflare mais perto de quem mediu, não a origem — esse
engano já foi cometido aqui uma vez. Cada tela faz várias idas servidor→banco **em fila** e só
uma ida navegador→servidor; encurtar as várias vence encurtar a única.
