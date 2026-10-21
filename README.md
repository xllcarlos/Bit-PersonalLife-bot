# 🧠 Routine AI Bot (Google Calendar + Notion Calendar)

> Assistente pessoal de gestão de rotina racional e dinâmica.  
> Conectado ao **Telegram**, alimentado pelo **Gemini 2.0 Flash (Gratuito)** e sincronizado com o **Google Calendar**, pronto para você visualizar e arrastar no seu **Notion Calendar**.

---

## 🎯 Por que este sistema é dinâmico?

- **Sem rotinas engessadas no código:** O bot não assume horários inventados ou estáticos de academia ou laboratório. Ele faz a leitura dos **compromissos reais que você tem na sua agenda hoje** para os próximos **14 a 21 dias**.
- **Flexibilidade total no Notion Calendar:** Se você precisou mudar a academia das 06:30 para as 10:30 ou 16:00, basta arrastar o bloco no Notion Calendar. O bot lerá essa nova posição na próxima consulta!
- **Visão de médio prazo:** Ele analisa até 2 semanas à frente, permitindo pedidos como: *"Quero ler o artigo do MICCAI na próxima quinta à tarde"* ou *"Agende uma revisão para o final da semana que vem"*.
- **Sem conflitos e com respiro:** O Gemini calcula janelas livres reais e preserva folgas de 15 a 30 minutos entre os blocos.

---

## 🚀 Como Obter as Credenciais do Google Calendar (Service Account)

Usar uma **Conta de Serviço (Service Account)** é o método profissional e mais seguro para bots em serverless (Vercel), pois ela **nunca expira** e não precisa de telas de login do usuário:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um novo projeto (ex: `routine-calendar-bot`).
3. No menu lateral, vá em **APIs e Serviços ➔ Biblioteca**:
   - Pesquise por **Google Calendar API** e clique em **Ativar** (Enable).
4. No menu lateral, vá em **APIs e Serviços ➔ Credenciais**:
   - Clique em **+ Criar Credenciais ➔ Conta de serviço** (Service Account).
   - Dê um nome (ex: `calendar-bot`) e clique em **Criar e Continuar ➔ Concluir**.
5. Na lista de Contas de Serviço, clique no e-mail recém-criado (algo como `calendar-bot@seu-projeto.iam.gserviceaccount.com`):
   - Vá na aba **Chaves (Keys)** ➔ **Adicionar Chave ➔ Criar nova chave**.
   - Escolha o formato **JSON** e clique em Criar. O arquivo JSON será baixado no seu computador.
6. Abra o arquivo JSON baixado:
   - O campo `client_email` é o seu `GOOGLE_CLIENT_EMAIL`.
   - O campo `private_key` é a sua `GOOGLE_PRIVATE_KEY`.
7. **O passo mais importante (Compartilhar sua agenda):**
   - Acesse o [Google Agenda Web](https://calendar.google.com/) no seu navegador.
   - Na barra lateral esquerda, passe o mouse sobre a sua agenda principal (`carlossantana.casds@gmail.com`) e clique nos **`...` ➔ Configurações e compartilhamento**.
   - Role até a seção **"Compartilhar com pessoas ou grupos específicos"** e clique em **+ Adicionar pessoas e grupos**.
   - Cole o e-mail da Conta de Serviço (`calendar-bot@...iam.gserviceaccount.com`).
   - Em Permissões, selecione: **"Fazer alterações em eventos"**.
   - Clique em Enviar.

Pronto! Agora o seu bot tem permissão de ler seus horários ocupados e agendar diretamente na sua agenda do Google (que sincroniza instantaneamente com o Notion Calendar).

---

## 💻 Testando Localmente

1. Entre na pasta:
   ```bash
   cd routine-ai-bot
   ```
2. Crie seu `.env.local` preenchendo as chaves:
   ```bash
   cp .env.example .env.local
   ```
3. Inicie o servidor:
   ```bash
   npm run dev
   ```

---

## ☁️ Deploy na Vercel

1. Suba este projeto para um repositório no seu GitHub.
2. Na [Vercel](https://vercel.com/), clique em **Add New... ➔ Project** e importe o repositório.
3. Configure as variáveis de ambiente (`TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USER_ID`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`).
4. Clique em **Deploy**.
5. Assim que terminar, acesse no navegador a URL do projeto com `/api/setup-webhook`:
   ```
   https://seu-bot.vercel.app/api/setup-webhook
   ```
6. Abra o seu bot no Telegram e envie seu primeiro áudio!
