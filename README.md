# Prospecta WA

CRM inicial para prospecção e atendimento por WhatsApp. A aplicação Next.js pode rodar na Vercel; Inngest Cloud processa eventos duráveis sem processo BullMQ ou worker separado. O banco PostgreSQL mantém leads, mensagens e supressões. Upstash Redis é usado para limitar tentativas de login.

## Incluído

- Painel responsivo e tela de login administrativa.
- Sessão JWT assinada em cookie `HttpOnly`, `Secure` em produção, `SameSite=Strict`, com expiração de 8 horas.
- Senha validada por bcrypt e armazenada somente como hash em variável secreta.
- Limite de cinco tentativas de login por IP a cada dez minutos, com Upstash Redis REST; em desenvolvimento local usa um limite em memória.
- Proteção CSRF por validação de origem, middleware de autenticação, cabeçalhos de segurança e rotas de API protegidas.
- Webhook Evolution com segredo obrigatório em produção; filtra grupos, mensagens próprias, eventos duplicados e contatos inelegíveis.
- Regra rígida de respostas: lead deve existir, ter envio inicial confirmado e não estar bloqueado/suprimido, tanto no webhook quanto antes da IA e do envio.
- Buffer por contato via debounce do Inngest, processamento serial por conversa, tentativas automáticas e controle global de ritmo de envio.
- Busca empresarial via Outscraper: termos, localização, país, limite, empresas com/sem site, deduplicação por telefone/ID do provedor, frequência de 6h a 30 dias e histórico das execuções.
- Gemini para respostas com contexto autorizado; Evolution para envio; automação desligada por padrão.

## Ainda depende de configuração ou desenvolvimento

Ainda faltam a interface completa de conversas, integração de calendário, faturamento, autenticação multiusuário e geração automática da primeira abordagem. A busca salva empresas com número de telefone disponível como leads `READY`; ela **não inicia mensagens**. Isso separa a descoberta de empresas do contato comercial.

## Configuração local

1. Instale Node.js 20+, PostgreSQL e dependências: `npm install`.
2. Copie `.env.example` para `.env`.
3. Configure `DATABASE_URL`, `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`, as chaves REST do Upstash, `OUTSCRAPER_API_KEY`, credenciais da Evolution e `GEMINI_API_KEY`.
4. Gere um hash bcrypt para a senha administrativa (não use nem compartilhe a senha em chats ou no repositório):

   ```powershell
   node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" "SENHA_FORTE_LOCAL"
   ```

   Coloque o hash resultante em `ADMIN_PASSWORD_HASH`. Crie `AUTH_SECRET` com pelo menos 32 caracteres aleatórios.

5. Em desenvolvimento, inicialize/atualize o banco com `npx prisma db push`. Em produção, aplique as migrations versionadas com `npm run db:migrate`.
6. Rode `npm run dev` e o servidor local do Inngest em outro terminal (`inngest dev`). Configure `INNGEST_DEV=1` no `.env` durante o desenvolvimento.
7. Cadastre o endpoint Inngest `/api/inngest` no Inngest Cloud ao publicar. Configure `INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY` conforme o ambiente; o serviço usa essas chaves para disparo e validação dos eventos.
8. Configure o webhook Evolution para `APP_URL/api/webhooks/evolution`, incluindo o cabeçalho `x-webhook-secret` com `EVOLUTION_WEBHOOK_SECRET`, e confirme o formato do evento e da rota de envio na sua versão da Evolution.

## Deploy na Vercel

Importe o diretório para a Vercel e adicione todas as variáveis de `.env.example` nos ambientes de Preview/Production. No Inngest, conecte o repositório ou registre a URL publicada para sincronizar as funções. A Vercel executa a aplicação e o endpoint de funções; não há worker BullMQ dedicado.

O rate limit de login em produção falha fechado se `UPSTASH_REDIS_REST_URL` ou `UPSTASH_REDIS_REST_TOKEN` não estiver configurado. As credenciais REST do Upstash são distintas da URL Redis `rediss://`; obtenha-as no painel Upstash. Redis não é necessário para a fila do Inngest.

## Operação e limites

- `AUTOMATION_ENABLED=false` mantém o envio e as respostas pausados. Ative apenas após configurar e validar todos os serviços.
- `INBOUND_BUFFER_SECONDS` define o período de silêncio para juntar mensagens consecutivas do mesmo contato.
- `SEND_RATE_PER_MINUTE` limita globalmente o início de fluxos de envio; ajuste respeitando limites do canal e volume esperado.
- O cron do Inngest verifica buscas habilitadas a cada hora e dispara as que venceram seu intervalo. Criar uma busca habilitada também dispara a primeira execução imediatamente.
- Cada termo pode solicitar até 100 negócios; limite total por execução é 200. O provedor pode cobrar por resultados conforme o plano e os créditos da conta. Verifique [preços atuais do Outscraper](https://outscraper.com/pricing/) antes de habilitar frequências altas.
- A busca usa a API `/google-maps-search` do Outscraper e segue seu modelo assíncrono com consulta de resultados; veja [documentação da API](https://docs.outscraper.com/endpoints/google-maps-search/). Confira os termos, a política de dados e as regras locais aplicáveis à prospecção antes de ativar campanhas.
- O webhook requer segredo em produção. Se a sua versão Evolution não permitir cabeçalho personalizado, proteja o webhook num proxy autenticado antes de expô-lo.
- Tentativas automáticas podem repetir uma chamada externa se a conexão cair depois do envio e antes da confirmação persistida. Revise o comportamento de idempotência da sua versão da Evolution e monitore falhas no Inngest.
- O usuário administrativo é configurado por variáveis de ambiente; não existe cadastro público nem recuperação de senha nesta versão.
- O envio comercial depende das políticas vigentes do WhatsApp e das regras aplicáveis aos contatos e à origem dos dados. Respeite opt-out e mantenha listas de supressão.
