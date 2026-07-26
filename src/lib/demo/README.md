# Modo demonstração

Esconde a operação real e mostra uma carteira fictícia, para gravar vídeo /
portfólio sem expor dado de cliente. **Só admin** liga, e vale só para o
navegador de quem ligou: os consultores e líderes que estiverem trabalhando no
sistema naquele momento continuam vendo os dados de produção normalmente.

## Como usar

Barra lateral, rodapé → **Dados demo**. Um selo âmbar "DADOS DEMO" aparece na
barra do topo enquanto está ligado. Para sair, o mesmo botão. O modo também cai
sozinho ao fechar o navegador e ao sair da conta.

## A garantia

**No modo demo nenhum dado de negócio é lido ou escrito no banco.** Não existe
tabela de demonstração, não existe migration, não existe linha marcada como
fictícia em produção. Os dados são gerados em memória e servidos no lugar do
Supabase. Não é uma promessa de que "tomamos cuidado ao escrever" — é a ausência
do caminho: a escrita não tem para onde ir.

O que ainda vai ao banco durante uma demonstração, de propósito: a autenticação
e a leitura do seu próprio perfil em `profiles`. É justamente o que decide se
você pode estar em modo demo, então não poderia vir de dado fictício. Nada disso
chega à tela.

Três caminhos precisavam ser cobertos, e são:

| Caminho | Como é coberto |
|---|---|
| Leitura em Server Component | `createClient()` devolve o cliente demo (`server.ts`) |
| Leitura/escrita em componente de tela | `createClient()` do navegador manda o plano para uma Server Action (`client.ts`) |
| `service_role` (criar/excluir usuário) | Barreira explícita, recusa a ação (`guarda.ts`) |

O terceiro é o que mais importa: aquelas rotas atravessam a RLS e mexem em
`auth.users`. Sem a barreira, demonstrar a tela de Usuários criaria um usuário
**de verdade** no sistema em produção.

O que continua real durante uma demonstração: login, sessão e logout. O modo
demo troca os dados, não quem está logado.

## Como está montado

```
dataset.ts     dados fictícios, gerados com semente fixa (determinístico)
plano.ts       a consulta descrita como dado serializável
construtor.ts  imita o encadeamento .from().select().eq() e monta o plano
motor.ts       executa o plano contra os dados em memória (só no servidor)
estado.ts      o gate: cookie + papel de admin conferido no banco
cookie.ts      o nome do cookie e a leitura do estado ATUAL pelo navegador
acoes.ts       ponte do navegador (Server Actions), revalida permissão
guarda.ts      barreira para as escritas que não passam pelo cliente Supabase
```

O servidor é sempre quem executa. O navegador manda o plano e recebe a resposta,
em vez de ter uma cópia própria dos dados — se tivesse, uma edição feita durante
a gravação apareceria numa tela e sumiria na seguinte.

### Por que o navegador lê o cookie a cada chamada

Esta é a parte que já esteve errada, e vale saber o porquê antes de "simplificar"
de volta. O roteamento do navegador (banco real × demonstração) precisa vir do
cookie, lido **no momento da chamada**.

A versão anterior entregava esse veredito por prop, do layout para uma variável
de módulo. Só que layout **não re-renderiza em navegação client-side** (partial
rendering), enquanto o cookie é relido pelo servidor a cada requisição. Bastavam
duas abas: liga o modo demo numa, a outra passa a receber dado fictício do
servidor e continua achando que está em produção — e manda as escritas para o
banco real. O caminho mais caro nesse estado é o import da Planilha Geral, que
começa apagando o snapshot real da data.

Por isso o cookie não é `httpOnly`. Ele nunca foi a autorização: quem autoriza é
`estado.ts`, conferindo o papel no banco a cada requisição.

`SincronizarDemo` (em `components/layout/`) fecha o resto do buraco: se o cookie
mudou por fora desta aba, recarrega, para o selo e o botão não contarem uma
história diferente da dos dados.

### Por que o gate confere o papel toda vez

O cookie sozinho não liga nada. `modoDemoAtivo()` exige cookie **e** perfil
`admin` lido do banco, a cada requisição. Um consultor que forje o cookie
continua vendo a operação real. Por isso `getProfile()` (que no modo demo devolve
uma persona fictícia, para o nome real do admin não aparecer no vídeo) **nunca**
deve ser usado para decidir permissão — para isso existe `perfilReal()`.

## Testes

```
node src/lib/demo/motor.test.mjs
```

Replica as consultas reais de cada tela contra o motor, com as mesmas strings de
coluna que o app usa. O risco que este teste cobre é específico: consulta mal
emulada não quebra a tela, ela abre **vazia e sem erro** — e isso só apareceria
no meio da gravação.

## Limites conhecidos

- **Edições feitas durante a gravação são temporárias.** Vivem na memória do
  processo. Rodando local (`npm run dev`) duram a sessão inteira; na Vercel, se a
  instância reciclar, o dataset volta ao ponto inicial. As leituras são sempre
  idênticas — o gerador é determinístico.
- **A tela de Usuários não cria nem exclui** no modo demo (é a barreira acima).
  O resto da tela funciona normalmente para mostrar na gravação.
- **O dataset é um só por processo.** Se dois admins estiverem em demonstração
  ao mesmo tempo, dividem o mesmo conjunto mutável, e quem desligar zera o do
  outro. Não afeta produção — só atrapalha gravar a dois.
- As datas das planilhas são fixas (`DATA_BASE` em `dataset.ts`). Se for gravar
  bem depois, atualize essa constante. As rotas da Agenda já acompanham o
  calendário sozinhas.
