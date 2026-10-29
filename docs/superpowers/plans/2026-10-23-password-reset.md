# Geração de link de redefinição de senha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que gestores gerem um link de redefinição para compartilhar com o titular, que define a própria senha por uma página Supabase de recuperação.

**Architecture:** Uma Server Action revalida quem solicita, o perfil alvo, papel, status e modo demo antes de gerar um link Supabase Auth `recovery`. O link é mostrado uma vez ao gestor autorizado para cópia e envio manual. Uma página pública processa a sessão de recuperação no navegador e atualiza apenas a senha.

**Tech Stack:** Next.js 16 App Router, React 19, `@supabase/ssr`, `@supabase/supabase-js` 2.x e Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-10-23-password-reset-design.md`

## Global Constraints

- Senha mínima: 8 caracteres.
- O servidor recebe apenas o ID do perfil alvo; e-mail e papel vêm do banco.
- Revalidar sessão, perfil ativo, papel e `canManageUsers` no servidor.
- Bloquear a própria conta nesta ação administrativa.
- Bloquear envio em modo demo antes de qualquer chamada ao Auth.
- Usar fluxo implícito isolado para que o link funcione no navegador do titular, sem depender de sessão ou verificador PKCE guardado no navegador do gestor.
- Obter o e-mail de destino via `auth.admin.getUserById(target.id)`, pois `profiles.email` pode divergir do e-mail em Auth.
- Construir `redirectTo` com `NEXT_PUBLIC_SITE_URL` ou fallback fixo `https://www.tri3dashboard.com.br` e caminho `/redefinir-senha`; nunca confiar em `Host` ou `Origin` arbitrários.
- Não registrar senha, token ou link. Retornar o action link apenas ao gestor autorizado, para compartilhamento explícito.
- Não alterar cargo, e-mail, dados de perfil, variáveis hospedadas ou configurações de produção.

## Review Focus

- Fluxo de recuperação começa no navegador do gestor e termina no navegador do titular; o cliente do pedido precisa evitar uma dependência de PKCE no navegador do gestor.
- Link inexistente, expirado ou já consumido; a página deve impedir a troca e oferecer caminho para retornar ao login e pedir novo link ao gestor.
- Senha menor que 8 caracteres ou confirmação divergente; a interface não pode enviar a atualização.
- Perfil alvo inativo, próprio, inexistente ou fora do escopo de `canManageUsers`; a Server Action deve recusar antes do Auth.
- URL de retorno alterada por cabeçalho `Host`/`Origin`; a URL final deve permanecer na origem confiável configurada e no caminho fixo.

## Arquivos e responsabilidades

- `src/app/(dashboard)/dashboard/usuarios/actions.ts`: autorização e geração do link de recuperação.
- `src/lib/supabase/client.ts`: fábrica de cliente browser com fluxo implícito usada somente pela página de redefinição.
- `src/app/(auth)/redefinir-senha/page.tsx`: rota pública de recuperação.
- `src/app/(auth)/redefinir-senha/page.tsx`: leitura da sessão de recuperação e formulário da nova senha.
- `src/app/(dashboard)/dashboard/usuarios/UsuariosClient.tsx`: ação e feedback por usuário.

## Tasks

### Task 1: Geração segura do link de recuperação

**Files:**
- Modify: `src/app/(dashboard)/dashboard/usuarios/actions.ts`

**Interface:**
- Produces: `gerarLinkRedefinicaoSenha(userId: string): Promise<{ ok: boolean; url?: string; error?: string }>`.

- [x] Adicionar Server Action que recupere o perfil do solicitante e o alvo pelo banco real; verificar `admin`/`dono`, solicitante ativo, alvo ativo, `userId !== me.id`, `canManageUsers(me.role, target.role)` e `escritaBloqueadaPeloDemo()` antes da chamada Auth.
- [x] Obter `targetAuth` com `createAdminClient().auth.admin.getUserById(userId)`; recusar se `targetAuth.user.email` estiver ausente.
- [x] Chamar `auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })` com a URL-base indicada nas restrições globais e caminho fixo `/redefinir-senha`.
- [x] Mapear erro do Auth para mensagem segura; não incluir o e-mail na resposta nem registrar URL/token. Retornar o link somente ao gestor autorizado.

### Task 2: Página pública para definir nova senha

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Create: `src/app/(auth)/redefinir-senha/page.tsx`
- Create: `src/app/(auth)/redefinir-senha/RedefinirSenhaClient.tsx`

**Interface:**
- Produces: `createRecoveryClient()` que compartilha a configuração pública do Supabase e usa `flowType: 'implicit'` para processar o token do fragmento no navegador do titular.

- [x] Adicionar a fábrica dedicada de cliente browser de recuperação, preservando a fábrica de cliente existente e seus comportamentos do modo demo.
- [x] Criar página fora do grupo autenticado do dashboard, com estados de inicialização, recuperação válida, link inválido/expirado, erro ao salvar e sucesso.
- [x] Aceitar nova senha e confirmação; exigir mínimo de 8 caracteres e igualdade antes de chamar `auth.updateUser({ password })`.
- [x] Só habilitar envio após confirmar sessão de recuperação; após sucesso, encerrar a sessão e encaminhar ao login sem expor detalhes do token.

### Task 3: Ação na lista de usuários

**Files:**
- Modify: `src/app/(dashboard)/dashboard/usuarios/UsuariosClient.tsx`

**Consumes:**
- `gerarLinkRedefinicaoSenha(userId)` da Task 1.
- `createRecoveryClient()` da Task 2 é consumido somente na página pública, não nesta tabela.

- [x] Exibir **Gerar link** apenas para `admin`/`dono`, em alvos ativos diferentes da própria conta e gerenciáveis por `canManageUsers`.
- [x] Ao clicar, chamar a Server Action usando o ID do perfil e apresentar estado de carregamento ou erro inline; exibir o link temporariamente em um modal copiável.
- [x] Revisar o estado visual em linhas compactas e em viewport estreita, mantendo acessibilidade por teclado e nomes acessíveis dos botões.

## Execução

- A especificação aprovada inclui revisão dos estados de autorização, demo, senha, sessão e URL de retorno; seguir esses critérios sem alterar dados reais nem enviar mensagens de teste a usuários durante a implementação.
- A validação depende de `redirectTo` cadastrado em Redirect URLs do Supabase Auth. SMTP não é necessário: o gestor copia e envia o link manualmente. As alterações hospedadas ficam fora deste plano.
- A autorização de implementação não autoriza deploy de produção nem alteração de variáveis de produção.
