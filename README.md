# 🧠 Routine AI Bot

Secretário de agenda no Telegram. Você manda texto ou áudio; o **Gemini** entende, consulta o **Google Calendar** e responde. Os eventos aparecem no **Notion Calendar** (que sincroniza com o Google).

O bot **não assume horários fixos**: ele lê a agenda real (hoje até 14 dias à frente). Se você arrastar a academia no Notion Calendar, ele passa a enxergar o novo horário.

## O que ele faz
- **Consultar:** "como está meu dia?", "o que tenho amanhã?", `/agenda`
- **Agendar:** propõe um horário sem conflito e pede confirmação por botão. Avisa se houver conflito ou se o horário já passou.
- **Contestar:** "Outro horário" (ou só responder "joga pra sexta") gera uma nova proposta com o contexto da anterior.
- **Alterar / excluir:** sempre com confirmação por botão. Só mexe em eventos da agenda principal.

Notion (tarefas) ainda **não** está integrado.

## Arquitetura
```
Telegram → /api/webhook (Vercel) → Google Calendar (lê agenda)
                                 → Gemini (interpreta, devolve JSON validado com zod)
                                 → Telegram (resposta / botões)
Upstash Redis: propostas pendentes (botões), contexto da conversa, deduplicação de updates
```

## Configuração

Todas as variáveis estão em [`.env.example`](.env.example).

### Telegram
1. `@BotFather` → `/newbot` → `TELEGRAM_BOT_TOKEN`.
2. `@userinfobot` → seu ID → `ALLOWED_TELEGRAM_USER_ID`. **Obrigatório**: sem ele o bot recusa todos.
3. `TELEGRAM_SECRET_TOKEN`: um texto aleatório e longo (protege o webhook e o setup).

### Gemini
Chave em <https://aistudio.google.com/app/apikey> → `GEMINI_API_KEY`. Modelo em `GEMINI_MODEL`; reservas em `GEMINI_FALLBACK_MODELS`.

### Google Calendar (Service Account)
1. Google Cloud Console → ative a **Google Calendar API**.
2. Crie uma **Service Account** e uma chave JSON: `client_email` → `GOOGLE_CLIENT_EMAIL`, `private_key` → `GOOGLE_PRIVATE_KEY`.
3. No Google Agenda, compartilhe sua agenda com o e-mail da Service Account com permissão **"Fazer alterações em eventos"**. O ID da agenda (seu e-mail) vai em `GOOGLE_CALENDAR_ID`.
4. **Outras agendas (Família, Feriados)** — opcional, somente leitura: compartilhe com a Service Account e coloque os IDs em `GOOGLE_EXTRA_CALENDAR_IDS`, separados por vírgula. Agendas compartilhadas com uma Service Account **não** aparecem sozinhas; é preciso informar o ID.

### Redis (Upstash) — necessário na Vercel
Os botões precisam lembrar a proposta entre uma requisição e outra. Na Vercel: **Storage → Marketplace → Upstash Redis** (plano free), conecte ao projeto. As variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` são criadas sozinhas. Sem Redis, o bot usa memória local, que só serve para `npm run dev`; o `/start` avisa quando isso acontece.

## Deploy
1. Suba para o GitHub e importe na [Vercel](https://vercel.com/).
2. Defina as variáveis de ambiente e faça o deploy.
3. Registre o webhook abrindo no navegador:
   ```
   https://SEU-PROJETO.vercel.app/api/setup-webhook?key=SEU_TELEGRAM_SECRET_TOKEN
   ```
4. Mande `/start` para o bot.

## Desenvolvimento
```bash
npm install
cp .env.example .env.local
npm run dev     # servidor local
npm test        # testes unitários (fuso horário, formatação, validação do Gemini)
npm run build   # build + checagem de tipos
```

## Notas
- O fuso é `America/Sao_Paulo` com offset fixo `-03:00` (o Brasil não tem horário de verão desde 2019).
- A rota do webhook tem `maxDuration = 60` e o grammY foi configurado com timeout de 55 s. O padrão do grammY (10 s) encerrava o handler cedo e a Vercel congelava a função com a resposta pela metade.
- Se a leitura da agenda principal falhar, o bot avisa o erro em vez de dizer que o dia está livre.
