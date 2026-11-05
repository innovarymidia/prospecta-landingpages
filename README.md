# Prospecta WA

CRM completo para prospecção ativa B2B e atendimento automatizado por WhatsApp. A aplicação roda em Next.js 15 (App Router, React 19) e orquestra filas e eventos duráveis via Inngest Cloud / Dev Server (sem processo worker ou BullMQ). O banco PostgreSQL mantém leads, histórico de mensagens, campanhas e supressões.

---

## Recursos Implementados

- **Central de Atendimento & Conversas**: Modal deslizante com histórico completo de mensagens no estilo balões de chat (WhatsApp), com data, status de entrega (`Na fila`, `Enviada`, `Entregue`, `Falha`) e campo para respostas manuais.
- **Gerador de Abordagem Personalizada com IA**: Botão "Gerar abordagem" que usa o Google Gemini (`gemini-2.5-flash`) para redigir a 1ª mensagem contextualizada com o nome, segmento e diferenciais da empresa (com fallback automático se a chave ainda não estiver cadastrada).
- **Disparo Seguro da 1ª Mensagem**: Leads descobertos entram como `READY` sem enviar mensagens de forma autônoma. O disparo inicial é acionado com revisão e controle humano pelo botão "Abordar".
- **Gestão de Estágios do Lead**: Seletor para qualificação rápida no funil de vendas (`Pronto para contato`, `Enviado`, `Respondeu`, `Qualificado`, `Reunião marcada`, `Convertido`, `Encerrado`, `Opt-out`, `Bloqueado`).
- **Lista de Supressão & Bloqueios**: Aba dedicada para visualização de números que solicitaram cancelamento ou foram bloqueados pelo operador, com opção de desbloqueio em um clique.
- **Autenticação Administrativa & Proteção**:
  - Sessão JWT stateless via cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção com expiração de 8 horas.
  - Senha com hash bcrypt (`admin@prospecta.local` / `admin123456` configurado no `.env` local).
  - Rate limiting de 5 tentativas por IP / 10 minutos (in-memory local, Upstash Redis em produção).
  - Proteção CSRF obrigatória por validação de origem (`Origin` header).
- **Webhook Evolution API com Filtro Anti-Spam Rígido**:
  - Validação de segredo constante com `timingSafeEqual`.
  - Ignora grupos (`@g.us`), mensagens de broadcast e mensagens enviadas pelo próprio número (`fromMe`).
  - **Portão Rígido**: descarta qualquer mensagem de contatos que não sejam leads já cadastrados ou que não possuam envio inicial confirmado (`initialSentAt`).
  - Detecção nativa de comandos de opt-out ("pare", "sair da lista", etc.), registrando a supressão automaticamente.
- **Buffer Inbound & Debounce Inngest**: Agrupa mensagens fragmentadas enviadas em sequência pelo cliente antes de acionar a IA (janela configurável via `INBOUND_BUFFER_SECONDS`).
- **Campanhas de Descoberta Outscraper**:
  - Busca automatizada de empresas no Google Maps por segmento e localização.
  - Filtro por presença de site (`any`, `missing`, `present`).
  - Deduplicação inteligente e importação com status `READY` sem disparo autônomo.
  - Cron periódico no Inngest com histórico detalhado das execuções.
- **Testes Automatizados**: Suíte de testes unitários nativa com Node.js (`npm test`), validando normalização de telefones, regras de bloqueio/opt-out e gerador de pitch.

---

## Como Rodar Localmente

O ambiente já está pronto e com as dependências instaladas.

### 1. Iniciar o Banco de Dados (PostgreSQL)
Certifique-se de ter um banco PostgreSQL rodando (local ou na nuvem como Supabase/Neon).
No arquivo `.env`, aponte a variável `DATABASE_URL`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prospecta_wa?schema=public"
```

Execute a migration para criar as tabelas:
```bash
npx prisma db push
```

### 2. Iniciar a Aplicação Next.js
```bash
npm run dev
```
Acesse em: [http://localhost:3000](http://localhost:3000)

**Credenciais padrão locais configuradas no `.env`**:
- **E-mail**: `admin@prospecta.local`
- **Senha**: `admin123456`

### 3. Iniciar o Inngest Dev Server (Opcional para testar filas localmente)
Em outro terminal:
```bash
npx inngest-cli@latest dev
```
O dashboard do Inngest abrirá em [http://localhost:8288](http://localhost:8288) conectado ao seu endpoint Next.js `/api/inngest`.

---

## Onde Inserir Suas Chaves Externas (`.env`)

O arquivo `.env` já foi criado com segredos criptográficos locais preenchidos. Quando desejar conectar suas ferramentas reais, basta preencher os seguintes campos:

| Serviço | Variáveis no `.env` | Para que serve |
| :--- | :--- | :--- |
| **PostgreSQL** | `DATABASE_URL` | Armazenamento de leads, conversas e supressões |
| **Google Gemini** | `GEMINI_API_KEY` | Respostas inteligentes e geração de abordagens |
| **Evolution API** | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | Envio de mensagens no WhatsApp e webhook |
| **Outscraper** | `OUTSCRAPER_API_KEY` | Busca de empresas no Google Maps |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting em produção |
| **Ativação** | `AUTOMATION_ENABLED="true"` | Ligue quando quiser ativar os envios pelo WhatsApp |

---

## Testes & Qualidade de Código

Para rodar a suíte de testes unitários:
```bash
npm test
```

Para verificar integridade de tipos:
```bash
npx tsc --noEmit
```

Para gerar build de produção:
```bash
npm run build
```
