# Agente de Reels e Stories — RBTech

Um site com login, só da RBTech, onde a IA deixa pronto:

- **Todo dia, antes das 9h:** o roteiro de 20 stories do dia, com estratégia da época (Black Friday, Natal, 13º...).
- **Toda segunda de manhã:** o relatório dos reels que viralizaram nas lojas de referência, com roteiros para gravar. Também avisa no WhatsApp.

Ninguém precisa deixar computador ligado: tudo roda nos servidores da Vercel, sozinho, no horário.

## Como funciona

```
Todo dia ~8h  →  /api/stories
                   busca os posts de ontem das lojas de referência (API do Instagram)
                   + os stories da própria RBTech
                   + os prints de stories que você subiu no site
                   + as datas comerciais próximas e o estoque
                   →  a IA (Claude) monta 20 stories  →  aparece no site

Segunda ~8h   →  /api/gerar
                   busca 30 dias de posts das lojas de referência
                   →  a IA acha os virais e escreve os roteiros de reels
                   →  aparece no site e avisa no WhatsApp
```

**Sobre os stories das concorrentes:** o Instagram não deixa nenhum sistema ler os stories de outras contas. Por isso o site tem a aba **Prints**: tire prints dos stories delas durante o dia e envie. O roteiro do dia seguinte usa esses prints. Sem prints, a IA usa os posts e reels delas, o calendário e o estoque.

Toda a análise é feita pela IA. O código só busca os dados e entrega a ela.

## O site

| Aba | Para quê |
|---|---|
| **Stories** | Roteiro do dia em cartões: horário, cena, fala, texto na tela, figurinha. Botão para copiar e marcar como postado. Dá para ver dias anteriores e gerar de novo na hora. |
| **Prints** | Enviar prints dos stories das concorrentes (direto da galeria do celular). |
| **Reels** | Relatório semanal de reels, com histórico. |
| **Configurações** | Lojas de referência, estoque da semana, informações da loja, quantos stories por dia. |

O acesso é por e-mail e senha, definidos nas variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD` da Vercel (nunca no código). Depois de 5 senhas erradas seguidas, o login fica bloqueado por 15 minutos. A sessão dura 7 dias.

## Instalação (uma vez só)

### 1. Instagram (API da Meta)

1. O Instagram da RBTech precisa ser **conta comercial ou de criador**, ligada a uma Página do Facebook.
2. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Business**.
3. Gere um token com as permissões `instagram_basic`, `instagram_manage_insights`, `pages_show_list` e `pages_read_engagement`. Para não vencer, gere pelo **usuário do sistema** do Gerenciador de Negócios.
4. Descubra o `IG_USER_ID`: no Explorador da Graph API, chame `me/accounts?fields=instagram_business_account` e copie o `id`.

### 2. WhatsApp (só para o aviso do relatório de reels)

1. No mesmo app, adicione o produto **WhatsApp** e cadastre um número (não o pessoal do dono). Copie o **Phone number ID**.
2. Dê ao usuário do sistema a permissão `whatsapp_business_messaging` e gere o token.
3. Crie o modelo de mensagem `relatorio_semanal`, categoria **Utilidade**, idioma **Português (BR)**, corpo:
   `Seu relatório de reels da semana ({{1}}) está pronto 🎬 Responda esta mensagem para receber os roteiros.`
   Exemplo para `{{1}}`: `10/11/2026 a 17/11/2026`.

### 3. Vercel

1. Em [vercel.com](https://vercel.com), importe este repositório.
2. Em **Storage**, crie um **Blob** e conecte ao projeto.
3. Em **Settings > Environment Variables**, cadastre as variáveis do [`.env.example`](.env.example), incluindo `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SESSION_SECRET`.
4. Publique. O site fica em `https://SEU-PROJETO.vercel.app`.

### 4. Webhook do WhatsApp

No app da Meta, em WhatsApp > Configuração: URL `https://SEU-PROJETO.vercel.app/api/whatsapp`, token de verificação igual ao `WHATSAPP_VERIFY_TOKEN`, e assine o campo **messages**.

### 5. Primeiro uso

Entre no site, vá em **Configurações**, preencha as informações da loja, o estoque e as lojas de referência. Depois, na aba **Stories**, toque em **Gerar agora** para ver o primeiro roteiro.

## Rotina

- **Todo dia:** abra o site de manhã e grave os stories. Durante o dia, se vir stories bons das concorrentes, tire print e envie na aba Prints.
- **Toda semana:** atualize o estoque em Configurações antes de segunda.

## Horários

Definidos em `vercel.json`, em UTC (Florianópolis = UTC−3):

- Stories: `7 11 * * *` → todo dia às 08:07.
- Reels: `17 11 * * 1` → segunda às 08:17.

No plano gratuito (Hobby) da Vercel, o agendamento pode rodar a qualquer minuto dentro daquela hora, ou seja, entre 8h e 9h. Os stories ficam prontos antes das 9h.

## Limites

- Cada geração pode levar até 5 minutos no plano Hobby. Se der tempo esgotado, use `CLAUDE_EFFORT=low` ou menos stories por dia. No plano Pro, aumente `maxDuration` para 800 em `vercel.json`.
- A API só entrega curtidas e comentários de outras contas, sem visualizações. Contas pessoais não aparecem.
- As contas (mediana, multiplicador) são feitas pela IA e podem ter pequenos erros com muitos posts.

## Rodar no computador

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha o `.env`. Para abrir o site em `http://localhost:3000` (sem `BLOB_READ_WRITE_TOKEN`, guarda tudo em `.dados/`):

```bash
npm run site
```

Para gerar o relatório de reels no terminal, sem enviar nada:

```bash
npm run gerar:local
```

Testes:

```bash
npm test
```

## Estrutura

```
public/              o site (login, painel)
api/stories.ts       roteiro diário de stories (agendado + botão do site)
api/gerar.ts         relatório semanal de reels (agendado + botão do site)
api/whatsapp.ts      webhook: entrega o relatório quando o dono responde
api/painel/          login, configurações, histórico e prints
src/stories.ts       coleta e prompt dos stories
src/prompt.ts        prompt dos reels
src/calendario.ts    datas comerciais
src/auth.ts          login e sessão
src/meta.ts          API do Instagram
src/claude.ts        chamada à IA
src/armazenamento.ts Vercel Blob (ou .dados/ no computador)
config/              valores iniciais das configurações
```
