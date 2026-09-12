# Auditoria de responsividade e bugs — setembro/2026

Varredura de leitura sobre `master` em 08/09/2026, commit base `60b90e2`.
22 achados, divididos em 10 sessões de trabalho.

**Atualizado em 11/09/2026:** dois commits (`d22e7a3`, `b311081`, sem relação com
os achados — corrigiram lat/lng virando centro de bairro) tocaram arquivos citados
nas sessões 01, 02, 05, 07, 08, 09 e 10. Todo `file:line` foi conferido contra o
código atual e corrigido; nenhum achado foi resolvido por engano. A sessão 10 ganhou
um parágrafo novo porque o volume do Nominatim mudou de verdade, não só a linha.
Se um número de linha não bater no futuro, é sinal do mesmo tipo de deriva —
localizar pelo trecho de código citado, não confiar cego na linha.

## Onde está cada coisa

| O quê | Arquivo local | Link publicado |
|---|---|---|
| Relatório de auditoria (22 achados) | [`auditoria.html`](./auditoria.html) | https://claude.ai/code/artifact/d6d06301-4c92-4f22-9e63-0d55b0cdd9b7 |
| Plano de sessões (com os prompts) | [`plano-sessoes.html`](./plano-sessoes.html) | https://claude.ai/code/artifact/908c93e9-527d-4fe1-89a8-d40c7a584381 |
| Prompts em texto puro | este arquivo | — |

Os `.html` abrem direto no navegador (duplo clique) e não dependem de rede.
Os links publicados são privados da conta e ficam listados em claude.ai/code/artifacts.

## Como usar

Uma sessão = um bloco. Abrir sessão nova do Claude Code, colar o prompt, executar
até o fim, `/clear`. Não emendar duas sessões sem limpar.

Os prompts não repetem o que já está no `CLAUDE.md` (canal `[BUGFIX]`/`[CRIAÇÃO]`,
causa raiz, verificar antes de declarar pronto, commit e push) — isso entra sozinho.

## Ordem e dependências

| # | Sessão | Fecha | Tempo | Depende de |
|---|---|---|---|---|
| 01 | Ordem total na paginação paralela | B1 | ~1h · 15 arquivos | — |
| 02 | Faxina: quatro correções pontuais | B2 · B8 · B9 · R11 | ~40min | — |
| 03 | A casca: faixa de delegação, gaveta e rolagem | B3 · R8 · V1 | ~1h | — |
| 04 | Camada de mapa: cor dos pinos e corrida no Leaflet | B4 · B6 | ~1h | — |
| 05 | Componente Modal, e migrar os seis existentes | R3 | ~1h30 | — |
| 06 | Zerar o ESLint | B5 | ~45min | **sessão 04** |
| 07 | Breakpoints: a tela cresce e o card encolhe | R1 · R2 | ~1h30 · 9 grades | — |
| 08 | Acabamento de responsividade, tela por tela | R4 · R5 · R6 · R7 · R9 · R10 · R12 | ~1h30 · 7 itens | **sessão 07** |
| 09 | Barra de filtros de Clientes | R13 | ~45min | sessão 07 |
| 10 | Nominatim: decidir antes de implementar | B7 | decisão + implementação | — |

**Se você só tem uma tarde:** 01 + 02 + 03. ~2h40, fecham 8 dos 22 achados,
incluindo três dos quatro de alta prioridade.

---

# Os prompts

## SESSÃO 01 — Ordem total na paginação paralela

`B1` · `Alta` · `~1h · 15 arquivos`

**Por que junto:** Sozinha, e primeiro. É a única que corrompe dado, e é toda na camada de consultas — nenhuma UI. Misturar tela aqui poluiria o contexto de um trabalho que é mecânico mas exige conferir o schema tabela por tabela. Só leitura no banco, então é a sessão mais segura de todas.

```text
[BUGFIX] Paginação paralela sem ORDER BY em buscarTudo

src/lib/supabase/buscar-tudo.ts conta as linhas e dispara TODAS as páginas em
paralelo com .range(). Sem ordenação total o Postgres não garante ordem estável
entre requisições independentes: a mesma linha pode cair em duas páginas e outra
em nenhuma, e a tela não dá erro nenhum.

A regra já está escrita, com o motivo, em
src/app/(dashboard)/dashboard/carteira/page.tsx:68 — é o único dos 16 pontos de
chamada que a aplica. Os outros não.

Só morde acima de 1000 linhas. A tabela `clientes` tem ~3.200 (4 páginas) e é lida
em 6 telas. O gatilho real é o botão "Geocodar sem GPS"
(ClientesClient.tsx:472), que faz centenas de UPDATE e muda a ordem física do heap.

O que fazer:

1. Mudar a assinatura de buscarTudo para EXIGIR a coluna de ordenação, para o
   próximo ponto de chamada não poder esquecer. Se na prática isso ficar ruim,
   me fala antes de fazer diferente.

2. Aplicar ordem TOTAL (o último critério tem que ser único) em:
   - radar/page.tsx:26 (clientes)
   - roteirizar/page.tsx:19 (clientes)
   - dashboard/page.tsx:77 (clientes) e :84 (mp_carteira)
   - acionaveis/page.tsx:59 (mp_carteira — hoje só .order('prio'), que empata em
     massa), :67 (mp_acionaveis), :81 (clientes)
   - queda-tpv/page.tsx:71 (mp_carteira), :89 (clientes), :96 (mp_acionaveis)
   - lib/supabase/ficha-mp.ts:55 (mp_carteira)
   - usuarios/convites.ts:61 (mp_carteira), :69 (clientes)
   - consultor/page.tsx:63 (mp_carteira)
   - clientes/page.tsx:36 (hoje .order('seller_nome') — nome repete, falta desempate)

3. carteira/page.tsx:77 já está certo. Usar como referência, não mexer.

Antes de escolher a coluna de desempate, conferir em supabase/migrations qual é
única em cada tabela. Não chutar: em mp_carteira o mesmo seller_id aparece uma vez
por snapshot, então seller_id sozinho não é ordem total ali.

Não mexer em nada de UI nesta sessão.

Fechar com: npm run build, npx tsc --noEmit, os testes de src/lib/*.test.mjs, e
abrir Clientes, Radar e Roteirizar conferindo que a contagem de clientes bate entre
as três telas.
```

## SESSÃO 02 — Faxina: quatro correções pontuais

`B2 · B8 · B9 · R11` · `Alta + baixas` · `~40min`

**Por que junto:** Juntas porque não se tocam. Quatro arquivos diferentes, zero interação, cada uma verificável sozinha. Agrupar aqui não suja contexto — separá-las custaria três aberturas de sessão para mudar dez linhas. Um commit por item.

```text
[BUGFIX] Quatro correções pontuais e independentes

São quatro coisas isoladas, sem interação entre si. Fazer uma de cada vez, com um
commit por item.

1. src/lib/geo.ts:35 — MAX_PARADAS_ROTA = 100, mas otimizarRota (geo.ts:270) monta
   [partida, ...stops, chegada] = 101 ou 102 coordenadas, e o /trip do OSRM público
   aceita 100. Ou seja: o botão "Selecionar todos (100)" que Clientes
   (ClientesClient.tsx:675) e Roteirizar (RoteirizarClient.tsx:214) oferecem é
   exatamente o caso que falha, e o usuário recebe a mensagem crua do OSRM em inglês.
   Baixar para 98 e barrar pontos.length > 100 DENTRO de otimizarRota, antes de sair
   pra rede, com mensagem em português. Acrescentar teste em src/lib/geo.test.mjs
   fixando MAX_PARADAS_ROTA + 2 <= 100 (hoje o teste que existe só prova que a
   constante não divergiu entre telas, não que ela cabe no serviço).

2. src/lib/carteira.ts:115 e :127 — o separador da chave do par de consultores é um
   byte NUL LITERAL, cru no arquivo. A escolha do NUL está CERTA e não é pra mudar:
   espaço quebraria com nome composto ("MARIA SILVA" + "JOAO SOUZA" daria de="MARIA",
   para="SILVA"). O problema é só a forma: o grep trata carteira.ts como binário e
   num editor o separador é invisível.
   Trocar pelo escape '\u0000' numa constante SEP, usada na montagem e no split.
   Mesmo byte. src/lib/carteira.test.mjs tem que continuar passando sem alteração.

3. src/app/page.tsx e src/app/(dashboard)/page.tsx resolvem as duas para "/" — grupo
   de rota não acrescenta segmento. Ambas só fazem redirect('/dashboard'), e o build
   serve a estática, então a de dentro do grupo é código morto.
   Apagar src/app/(dashboard)/page.tsx e conferir que "/" continua redirecionando.

4. Trocar min-h-screen (que é 100vh) por min-h-dvh em: (auth)/login/page.tsx:26,
   (auth)/convite/[token]/page.tsx:29, (dashboard)/AcessoDesativado.tsx:28,
   app/error.tsx:34 e app/global-error.tsx:29. O resto do app já usa 100dvh
   (RadarMapa.tsx:176) — só as telas de entrada ficaram para trás.

Fechar com build + tsc + testes, e abrir /login no DevTools em modo device
conferindo que o card não fica sob a barra de URL.
```

## SESSÃO 03 — A casca: faixa de delegação, gaveta e rolagem

`B3 · R8 · V1` · `Alta` · `~1h` · `Você dirige`

**Por que junto:** Juntas porque são literalmente os mesmos dois arquivos: Shell.tsx e Sidebar.tsx. Fazer em sessões separadas significaria reler a casca três vezes e arriscar conflito entre as três edições.

> ⚠️ Cuidado: testar o item 1 exige entrar na conta de alguém, e isso grava em acessos_delegados e no log de atividade no nome dessa pessoa. Use um consultor fictício se tiver, e saiba que o evento fica registrado.

```text
[BUGFIX] A casca do app: barra de delegação, gaveta e rolagem

Três problemas nos mesmos dois arquivos. Ler src/components/layout/Shell.tsx e
src/components/layout/Sidebar.tsx inteiros antes de mexer em qualquer um.

1. BarraDelegacao.tsx:52 é `fixed bottom-0 z-50` e o <main> do Shell.tsx:65 não
   reserva altura nenhuma pra ela. Seis telas têm pb-20/pb-16, mas essa folga é da
   BARRA DE SELEÇÃO, não da faixa — e as duas empilham: a barra de ação é z-30 e
   some debaixo da z-50.
   Reproduzir primeiro, com os próprios olhos: Usuários -> Entrar na conta de um
   consultor -> Clientes -> marcar 3 clientes. "Gerar rota" e "Enviar WhatsApp"
   ficam atrás da faixa amarela.
   Nas 11 telas SEM pb-* (Agenda, Roteirizar, Usuários, Metas, Comparar, Histórico,
   Por Área, Consultor, Upload, Alertas, Meu Desempenho) o último item da lista fica
   coberto sempre que há delegação em curso.
   Corrigir na raiz: a faixa publica a própria altura numa variável CSS e o main
   reserva a partir dela. NÃO sair espalhando pb-* tela por tela — isso é remendo e
   deixa as próximas telas quebradas de novo.

2. Sidebar.tsx:179 esconde a gaveta com -translate-x-full: ela sai da vista mas
   continua no DOM e focável. No celular o Tab percorre até 15 links de um menu
   invisível antes de chegar no conteúdo.
   Pôr `inert` no <aside> quando !aberto (React 19 suporta nativo). E quando aberta,
   travar a rolagem do fundo e prender o foco dentro dela — hoje o Tab sai da gaveta
   pro conteúdo atrás do véu.

3. ESTE É PRA VERIFICAR ANTES DE CORRIGIR. Com html/body em height:100% e
   overflow-auto no <main> (Shell.tsx:65), quem rola é o main, não o documento — e a
   restauração de rolagem do App Router age sobre a janela.
   Testar: descer bem numa lista longa em Clientes e clicar em Agenda no menu.
   Se a tela nova abrir no meio, rolar o main pro topo a cada mudança de pathname.
   Se abrir no topo, NÃO mexer, e me avisar que não era problema.

Fechar dirigindo os três no navegador: delegação ativa com a barra de seleção
aberta, Tab no modo device com a gaveta fechada, e navegação entre telas longas.
```

## SESSÃO 04 — Camada de mapa: cor dos pinos e corrida no Leaflet

`B4 · B6` · `Média` · `~1h` · `Você dirige`

**Por que junto:** Juntas porque as duas moram no Leaflet e a sessão começa abrindo o Radar de qualquer jeito. O B4 é o único achado não confirmado do relatório: a sessão abre verificando, e só depois corrige. Vem antes da sessão 06 porque reescreve efeitos do RadarMapa que o ESLint também acusa.

```text
[BUGFIX] Camada de mapa: cor dos pinos e corrida no carregamento do Leaflet

Ler src/app/(dashboard)/dashboard/radar/RadarMapa.tsx inteiro antes de mexer.

PRIMEIRO, VERIFICAR — não corrigir antes de ver: abrir /dashboard/radar e olhar os
pinos. Cliente selecionado deveria sair VERDE e não-selecionado VERMELHO
(RadarMapa.tsx:115). Se saírem pretos, é o problema 1. Me dizer o que você viu antes
de continuar.

1. Em vários pontos a cor entra como ATRIBUTO de apresentação SVG
   (fill="var(--color-good)") em vez de declaração de estilo. O Leaflet faz o mesmo
   por dentro: path.setAttribute('fill', options.fillColor), em
   node_modules/leaflet/dist/leaflet-src.js:13345. var() em atributo de apresentação
   não é substituído de forma confiável entre navegadores; onde não for, o valor é
   inválido, fill cai pro inicial (preto) e stroke pra nenhum.
   Em RadarMapa.tsx:115 a cor É O SINAL FUNCIONAL — verde é selecionado, vermelho não
   é. Se os dois saem pretos, a seleção no mapa deixa de ser legível.
   Onde está: RadarMapa.tsx:100, :106, :115 · PinMapa.tsx:56 · AgendaClient.tsx:73 e
   :76 (traçado da rota) · e o stroke= dos ícones em dashboard/page.tsx:46,
   meu-score/page.tsx:20, alertas/page.tsx:148, ConsultorClient.tsx:124,
   RadarClient.tsx:183, RoteirizarClient.tsx:343, app/error.tsx:37.
   A correção vale independente do resultado do teste: nos SVG do JSX usar
   style={{fill:'var(--color-good)'}}; nas opções do Leaflet resolver o token antes,
   com getComputedStyle. Os popups do Radar (RadarMapa.tsx:147-162) já fazem o certo,
   com style="color:var(...)" — seguir aquele padrão, não inventar outro.

2. RadarMapa.tsx:37-84 — o efeito de init é async (await import('leaflet')) e só
   chama desenhar() no fim. O efeito de redesenho ([pos, raio, clientes], linha 87)
   roda ANTES disso e sai cedo, porque mapRef.current ainda é null. Se o GPS
   responder antes do bundle do Leaflet baixar, esse redraw se perde e o mapa fica
   com o estado do primeiro render até alguém mexer no raio ou num filtro.
   Guardar um estado `pronto`, ligar no fim da inicialização e incluir nas
   dependências do efeito de redesenho.

3. De quebra, o ESLint acusa RadarMapa.tsx:34 (ref escrito durante o render) e :77
   (desenhar chamada antes de declarada). PinMapa.tsx:21 já faz o ref do jeito certo
   — copiar o padrão do vizinho em vez de inventar.

Fechar abrindo o Radar de verdade: pinos coloridos, seleção visível no mapa, e o
mapa desenhando certo já no primeiro carregamento — testar com o cache quente, que
é quando a corrida do item 2 aparece.
```

## SESSÃO 05 — Componente Modal, e migrar os seis existentes

`R3` · `Alta` · `~1h30` · `Você dirige`

**Por que junto:** Sozinha porque é [CRIAÇÃO], não conserto. Nasce um componente novo e seis telas migram para ele — é a única sessão da lista que pede checklist confirmado antes de escrever código, e fatias verticais depois.

> ⚠️ Cuidado: testar o modal Novo Usuário cria usuário de verdade em produção — e o modo demo bloqueia essa rota (escritaBloqueadaPeloDemo), então não dá para testar em demo. Crie um alvo fictício, tipo TESTE MODAL, e apague depois. Nunca teste no cadastro de uma pessoa real.

```text
[CRIAÇÃO] Componente <Modal> único, e migrar os 6 modais existentes

Hoje são 6 modais escritos à mão, cada um um pouco diferente. Problemas confirmados:

- UsuariosClient.tsx:800 ("Novo Usuário", 6 campos) e :619 usam
  `fixed inset-0 flex items-center` SEM overflow-y-auto, e o painel não tem max-h.
  Num celular em paisagem, ou em retrato com o teclado aberto, o topo do formulário
  sai da tela e não há como voltar a ele. O de :619 tem max-h-[85vh], mas só a lista
  de consultores rola — o formulário em si, não.
- Nenhum dos 6 fecha com Escape. A única tecla tratada no app inteiro é a da gaveta
  do menu (Shell.tsx:38).
- Nenhum tem role="dialog"/aria-modal, foco preso ou devolução de foco ao fechar.
- Nenhum trava a rolagem do fundo: no celular o dedo rola a página atrás do modal.
- Os de Clientes/GerarRota/QuedaTPV fecham clicando fora; os de Usuários não. Mesmo
  gesto, resultado diferente.

ANTES DE CODAR: me mostrar o checklist do que o componente vai garantir e a API
proposta, e esperar eu confirmar. Nesse checklist, avaliar o <dialog> nativo — ele
já entrega foco preso, Escape e trava de rolagem sem código nosso; se não servir,
dizer por quê.

Depois migrar em fatias, UM modal por vez, conferindo cada um no navegador antes de
passar pro próximo:
  1. UsuariosClient.tsx:800  (começar por este — é o que está quebrado)
  2. UsuariosClient.tsx:619
  3. ClientesClient.tsx:936
  4. ClientesClient.tsx:1032
  5. GerarRota.tsx:138
  6. QuedaTpvClient.tsx:765

ATENÇÃO ao testar o item 1: o banco é o de PRODUÇÃO e o modo demo bloqueia a rota de
criar usuário, então não dá pra testar em demo. Vou criar um alvo fictício e apagar
depois — não teste em cima de ninguém real.

Fechar dirigindo os 6 no DevTools em iPhone SE, retrato E paisagem: formulário
inteiro alcançável, Escape fecha, foco não escapa pro fundo, fundo não rola.
```

## SESSÃO 06 — Zerar o ESLint

`B5` · `Média` · `~45min` · `Depois da 04`

**Por que junto:** Sozinha porque tem uma linha de chegada objetiva: npx eslint src devolvendo zero. Isso é uma sessão inteira e boa. Vem depois da 04, que já deve ter resolvido os dois erros do RadarMapa.

```text
[BUGFIX] Zerar o ESLint

`npx eslint src` devolve hoje 7 erros e 3 avisos. Objetivo desta sessão: zero.

Rodar primeiro pra ver o que sobrou — uma sessão anterior mexeu no RadarMapa.tsx e
pode já ter resolvido os de lá. O que estava aberto:

- RoteirizarClient.tsx:205 e :213 — setErro() é chamado DENTRO do updater de
  setStops, via operador vírgula: `(setErro(...), prev)`. O updater pode rodar duas
  vezes em StrictMode ou render concorrente, e o efeito colateral vai junto.
  Calcular a condição antes e chamar os dois em sequência.
- RoteirizarClient.tsx:130 e :141 — setState síncrono dentro de efeito
- RadarClient.tsx:59 e :89 — idem
- AgendaClient.tsx:95 — idem
- RadarMapa.tsx:34 (ref escrito durante o render) e :77 (função chamada antes de
  declarada) — conferir se ainda existem
- Avisos: formatDateTimeBR não usado (HistoricoClient.tsx:52), meuNome não usado
  (RadarClient.tsx:37), useRef não usado (RoteirizarClient.tsx:3)

Nos setState-em-efeito, entender o que cada um faz antes de mexer. Alguns são
legítimos (derivar estado na montagem, ler localStorage) e o certo é reestruturar,
não calar com eslint-disable. Se algum realmente precisar do disable, escrever no
comentário POR QUE ele é a exceção — o resto do repositório faz assim.

Não aproveitar a sessão pra "melhorar" nada além disso.

Fechar com `npx eslint src` limpo, build, testes, e abrir Roteirizar, Radar e Agenda
conferindo que nada regrediu — principalmente a seleção de clientes no Roteirizar,
que é onde está a correção mais delicada.
```

## SESSÃO 07 — Breakpoints: a tela cresce e o card encolhe

`R1 · R2` · `Alta` · `~1h30 · 9 grades` · `Você dirige`

**Por que junto:** Sozinha porque começa por uma decisão de arquitetura — breakpoint de janela contra container query — e ela se aplica igual às nove grades. Decidir no meio de outra coisa é como isso vira meia migração.

```text
[BUGFIX] Breakpoints: a tela cresce e os cards encolhem

A sidebar entra em md (768px) ocupando 240px fixos, e o padding do main sobe de p-4
pra p-6. Mas as grades de cartão usam sm:grid-cols-2, que liga em 640px — antes disso.

  767px  ->  767 - 32                = 735px úteis  ->  2 col ~ 361px
  768px  ->  768 - 240 - 48          = 480px úteis  ->  2 col ~ 234px

Ou seja: abrir mais a janela PIORA o layout. O card de cliente cai de 361px pra
234px carregando nome, endereço, telefone, e-mail, CPF/CNPJ e ficha do MP.

Pior ainda quando a grade vive dentro de uma coluna. RoteirizarClient.tsx:336 divide
em lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)], e dentro da coluna direita roda
sm:grid-cols-2 xl:grid-cols-3 (:486):

  janela 1024 - 240 sidebar - 48 padding      = 736px
             - 340 coluna esquerda - 12 gap   = 384px de coluna direita
             - 32 padding do card             = 352px
             ÷ 2 colunas (sm: já ligado)      ~ 172px por card de cliente

RadarClient.tsx:223 tem o mesmo desenho.

Grades afetadas: clientes/ClientesClient.tsx:694 · acionaveis/AcionaveisClient.tsx:167
· carteira/CarteiraClient.tsx:142 · metas/MetasClient.tsx:253 ·
upload/UploadClient.tsx:246 e :251 · roteirizar/RoteirizarClient.tsx:486 ·
queda-tpv/QuedaTpvClient.tsx:899.

Duas saídas — quero SUA recomendação e o porquê antes de você escolher:
  (a) rápida: mover de sm:grid-cols-2 pra lg:grid-cols-2
  (b) certa: @container, porque quem decide quantas colunas cabem é a largura da
      COLUNA, não a da janela. O Tailwind 4 já traz container queries sem plugin.

Depois de decidir, fazer TELA POR TELA, não tudo de uma vez. Após cada tela, conferir
no DevTools nas larguras 375, 767, 768, 1024 e 1440 — a regra é uma só: o card nunca
pode encolher quando a tela cresce.
```

## SESSÃO 08 — Acabamento de responsividade, tela por tela

`R4 · R5 · R6 · R7 · R9 · R10 · R12` · `Média/baixa` · `~1h30 · 7 itens` · `Você dirige`

**Por que junto:** Juntas porque são todas do mesmo tipo: mudança de classe, sem lógica nova, verificada redimensionando o navegador. Sete telas diferentes, mas um modelo mental só. Vem depois da 07 — não vale ajustar detalhe numa grade que ainda vai mudar de breakpoint.

```text
[BUGFIX] Acabamento de responsividade — 7 itens independentes

Itens sem relação entre si, cada um numa tela. Fazer UM POR VEZ, conferindo no
DevTools em 360px e 768px, com commit separado por item.

1. AtividadeClient.tsx:218 — dois <input type="date"> + "De" + "até" + botão num
   único item flex, sem min-w-0 e sem flex-wrap interno. O globals.css força 16px em
   input no toque (bloco @media pointer:coarse — está certo, é o que impede o zoom do
   iOS), então cada campo fica ~140px e o grupo dá ~350px dentro dos 288px úteis de um
   iPhone SE. Como o main é overflow-auto, a tela INTEIRA desliza pro lado.
   Pôr flex-wrap no grupo e empilhar abaixo de sm. Considerar também overflow-x:clip
   no main como rede de segurança — hoje não existe nenhuma em lugar nenhum.

2. AgendaClient.tsx:415 — `grid grid-cols-3` sem breakpoint nenhum, com text-3xl
   dentro (o KPI, linha 33). Em 360px cada célula tem ~64px de texto útil, e
   "Km percorridos" com "1.234,5 km" não cabe. É a ÚNICA grade do app sem variante
   responsiva: todas as outras telas usam grid-cols-2 lg:grid-cols-4. Alinhar.

3. AgendaClient.tsx:439 — grid-cols-2 md:grid-cols-4 xl:grid-cols-7. Em md a área útil
   é 480px ÷ 4 = ~110px por dia, com cartão de rota (nome, paradas, ações) dentro.
   Pular o passo de 4 colunas, ou trocar por rolagem horizontal abaixo de xl.

4. QuedaTpvClient.tsx:528-536 — larguras fixas w-32 (nome) + flex-1 (barra) + w-12 +
   w-20 = 256px, mais 24px de gaps. Em 290px úteis a barra fica com ~10px — e a barra
   É a informação da linha, é ela que mostra quem perdeu mais.
   Abaixo de sm, empilhar: nome e valor numa linha, barra em largura total embaixo.

5. As 3 tabelas rolam de lado sem coluna fixa: rolando pra ver o Δ de um pilar,
   perde-se o nome do consultor. Pôr position:sticky; left:0 na primeira td e th, com
   fundo OPACO — o vidro translúcido do tema deixa o conteúdo passar por baixo.
   comparar/CompararClient.tsx:185 (11 colunas) · historico/HistoricoClient.tsx:135 ·
   usuarios/UsuariosClient.tsx:348.

6. Alvos de toque. BotaoContato.tsx padroniza 40px e explica por quê ("são os botões
   que a pessoa usa NA RUA, com o celular na mão"). Fora dele o padrão não pegou:
   - ClientesClient.tsx:715 — caixa de seleção do card em 16px. É o gesto principal
     pra montar rota em campo.
   - ClientesClient.tsx:767 — "sem GPS · geocodar", text-[11px] sem padding
   - AgendaClient.tsx:373-376 — "Refazer / Renomear / Excluir" colados, sem área
     clicável, e um deles é destrutivo
   - AgendaClient.tsx:428 e :432 — setas ‹ › da semana em 32px
   Crescer a ÁREA sem mexer no desenho: p-2 -m-2 nos links de texto, e um <label>
   envolvente na caixa de seleção.

7. DistribuicaoEquipe.tsx:36 — YAxis width={120} e margin right 48 dentro de um h-28
   (GeralClient.tsx:214). Em 290px úteis sobram 82px pra barra, e "Acima do objetivo"
   a 12px não cabe em 120px (o Recharts não quebra rótulo de categoria).
   Abaixo de sm, trocar por três linhas rotuladas com barra em largura total. São três
   valores — não precisa de gráfico pra contar essa história.

Nenhum item pode remover dado da tela. Se algum só couber cortando informação, pare e
me fale antes.
```

## SESSÃO 09 — Barra de filtros de Clientes

`R13` · `Baixa` · `~45min` · `Você dirige`

**Por que junto:** Separada da 08 porque muda comportamento, não classe. É a única da lista de responsividade que introduz um estado novo e mexe em duas telas — merece contexto limpo.

```text
[BUGFIX] A barra de filtros de Clientes ocupa 5 linhas no celular

ClientesClient.tsx:643-677 tem campo de busca + até sete MultiFiltro + "Só pendentes"
+ "Limpar filtros" + "Selecionar todos". Com flex-wrap nada estoura, mas empilha em
4-5 linhas antes do primeiro cliente aparecer: no celular a lista, que é o que a
pessoa abriu a tela pra ver, começa fora do campo de visão.

Abaixo de md, colapsar os sete chips num botão "Filtros" único com contador de
filtros ativos, abrindo a MESMA folha inferior que o MultiFiltro já usa
(MultiFiltro.tsx:74-77). Vale também pro Roteirizar (RoteirizarClient.tsx:459-478),
que tem exatamente a mesma barra.

Regra que não pode ser quebrada: NENHUM dado sai da tela. Os sete eixos continuam
todos acessíveis — Consultores, Cidades, Bairros, GPS, Situação, Prioridade,
Segmento —, só deixam de ocupar a tela inteira de saída. Mesclar em um controle
composto é a solução; cortar filtro, não é.

Ler MultiFiltro.tsx inteiro antes de escrever qualquer coisa: a folha inferior, os
alvos de ~40px e a busca interna já estão resolvidos lá, com o motivo comentado. É
pra reusar, não reescrever.

Fechar abrindo Clientes no DevTools em 375px: a lista tem que começar visível na
primeira dobra, e os 7 filtros continuarem alcançáveis em no máximo 2 toques.
Conferir também que o contador bate com o número de filtros de fato aplicados.
```

## SESSÃO 10 — Nominatim: decidir antes de implementar

`B7` · `Média` · `decisão + implementação` · `Decisão sua`

**Por que junto:** Por último porque é a única que não tem resposta certa — depende de custo e de quanto volume vocês querem geocodificar. O prompt pede opções, não código. Depois que você escolher, a implementação pode ser a mesma sessão ou uma nova, conforme o tamanho da escolha.

```text
[PERGUNTA] Geocodificação em massa contra o Nominatim — qual caminho seguir

Não quero código ainda. Quero a decisão.

Antes de ler o resto: os commits d22e7a3 e b311081 (10/09/2026) mudaram geocodarEmMassa
depois que esta pergunta foi escrita. Ler ClientesClient.tsx e geo.ts inteiros para
confirmar que a descrição abaixo ainda bate antes de responder — se algo mudou de novo,
me avisar em vez de responder em cima do que está desatualizado.

O que era verdade em 10/09: geocodarEmMassa (ClientesClient.tsx) percorre uma lista de
clientes a 1 requisição por 1,1s contra nominatim.openstreetmap.org, e agora é chamada
para DUAS categorias: "sem GPS" (lat/lng nulos) e "aproximados" (coordenada é centro de
bairro, coordenada_origem = 'aproximada' — ver a migration 2026-09-10_coordenada_origem
e a memória "coordenada-cliente-centroide-de-bairro"). Isso não reduziu o problema,
aumentou: o lote elegível ficou maior que quando esta pergunta foi escrita — a
memória registra 725 clientes só na categoria "aproximados".
Com algumas centenas de clientes isso é meia hora de requisições seguidas do mesmo IP,
e a política de uso do Nominatim veta geocodificação em massa.

Se o IP for bloqueado, geocodar() devolve null pelo catch e a tela apenas diz que não
achou. A falha vira "o endereço é ruim" e ninguém descobre que é bloqueio — e a função
para de funcionar pra todo mundo, calada.

Uma fatia do problema JÁ foi resolvida de graça pelos dois commits: geocodar() agora
tem um atalho (coordenadaNoTexto, geo.ts) que reconhece quando endereco_completo já É
um par de coordenadas e devolve na hora, sem chamar Nominatim nenhum. Isso não muda a
decisão a seguir — o volume que ainda precisa buscar por TEXTO continua grande —, mas
conferir se esse atalho já cobre uma fatia relevante do lote "aproximados" antes de
apresentar as opções.

Me apresenta as opções com custo e esforço de cada uma — manter o Nominatim com lote
menor, migrar o lote pro Photon (que já está lá como reserva), um provedor pago, ou
mover pro servidor com fila —, a sua recomendação com o porquê, e o que muda na tela em
cada caso.

Depois que eu escolher, implementamos junto com duas coisas que valem em qualquer
cenário:
- distinguir "não encontrado" de "bloqueado / erro de rede" no retorno de geocodar, e
  mostrar essa diferença na tela
- abortar o laço no desmonte do componente, não só no botão "Parar": hoje sair da tela
  no meio deixa as escritas correndo
```

---

_Gerado a partir do relatório de auditoria, extraído automaticamente do HTML
publicado (não redigitado). Nenhum arquivo de `src/` foi alterado ao gerar ou
atualizar este documento._
