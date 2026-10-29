# Link administrativo de redefinição de senha

## Objetivo

Permitir que administradores e donos gerem um link de recuperação para uma conta gerenciável pelo dashboard e o compartilhem diretamente com o titular. O titular define a nova senha; o gestor nunca vê nem escolhe a senha.

## Experiência

- A tabela em `/dashboard/usuarios` ganha a ação **Gerar link** nas contas que o gestor pode administrar, exceto a própria conta.
- A ação mostra um link copiável uma única vez; o gestor o encaminha ao titular por um canal privado.
- O link abre uma página pública de redefinição com campos de nova senha e confirmação, usando o mínimo de oito caracteres já adotado pelo cadastro.
- A página só permite salvar quando a sessão de recuperação do Supabase foi validada. Link inválido ou expirado recebe instrução para solicitar outro.
- Após a troca, a página informa sucesso e direciona a pessoa para o login.

## Fluxo técnico

1. A ação na tabela chama uma Server Action com o ID do perfil, sem receber e-mail do cliente.
2. A ação verifica o perfil autenticado e ativo, limita o uso aos papéis `admin` e `dono`, aplica `canManageUsers` ao papel do alvo e aplica `escritaBloqueadaPeloDemo()` antes de qualquer chamada de Auth. A própria conta não recebe esta ação nesta tela.
3. O servidor consulta o e-mail atual do usuário Auth pelo ID do alvo, em vez de confiar em `profiles.email`, que pode divergir, e gera um link `recovery` via `auth.admin.generateLink`. O destino usa uma URL-base confiável e fixa a rota pública `/redefinir-senha`. O link só retorna ao gestor autorizado para compartilhamento explícito; nunca é registrado.
4. A página pública consome o token do link no navegador do titular, confirma a sessão de recuperação e só então chama `updateUser({ password })`.
5. A conclusão não muda perfil, cargo nem e-mail. Senha e token não entram em logs; o link só fica na resposta autorizada e na memória da tela enquanto o gestor copia.

## Acesso e mensagens

- O alvo é resolvido pelo ID; papel, status e e-mail atual do Auth são revalidados no servidor. O cliente não pode escolher outro endereço de e-mail nem outro papel.
- Admin e dono seguem os limites existentes de `canManageUsers`; líder não ganha essa função. A própria conta usa o fluxo de recuperação iniciado pelo titular.
- O pedido de redefinição é recusado no modo demo, conforme a barreira usada pelas demais ações administrativas.
- O modal apresenta o link gerado e avisa que quem o possuir poderá redefinir a senha. A página pública apresenta erros de link de forma clara e não revela dados de outras contas.
- A nova senha não é guardada pelo dashboard; Supabase Auth valida e persiste a credencial.

## Escopo

Inclui a ação administrativa, a geração do link via Auth, a página pública de definição e confirmação da senha e o tratamento de sucesso/erro. Não inclui troca manual pelo gestor, alteração de cargo, envio de e-mail, provedor de e-mail nem configuração de SMTP.

## Dependência de configuração

O domínio de produção e o caminho `/redefinir-senha` precisam estar cadastrados na lista de Redirect URLs do Supabase Auth. Não é necessário configurar SMTP, pois o dashboard entrega o link ao gestor para compartilhamento. A URL-base vem de configuração confiável/fallback fixo, sem aceitar `Host`/`Origin` arbitrários. Nenhuma variável de produção ou configuração hospedada será alterada nesta implementação.

## Verificação planejada

- Conferir os estados da ação administrativa: sucesso, erro do Auth, conta não gerenciável, própria conta e modo demo.
- Conferir a página com sessão de recuperação válida, link expirado/inválido, senha curta, confirmação divergente e troca concluída.
- Confirmar que usuário, cargo e endereço do alvo vêm do servidor, e que token e senha não aparecem em logs; o link de ação aparece somente para o gestor autorizado na resposta e no modal temporário.

## Referências consultadas

- [Supabase: Password-based Auth](https://supabase.com/docs/guides/auth/passwords) — recuperação de senha, sessão autenticada e `updateUser`.
- [Supabase: Auth Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) — geração de link de recuperação sem envio automático.
- [Supabase: Implicit flow](https://supabase.com/docs/guides/auth/sessions/implicit-flow) — tokens no fragmento da URL são lidos pelo cliente e não enviados ao servidor.
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — destinos de retorno precisam estar permitidos no projeto.
- Next.js 16 local: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` e `16-proxy.md` — convenções de handlers e proxy.
