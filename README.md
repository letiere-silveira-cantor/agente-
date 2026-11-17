# Agente de Reels Virais — RBTech

Toda segunda-feira, o agente:

1. Busca os posts das lojas de referência e os da própria RBTech na API do Instagram.
2. Calcula quais posts viralizaram, comparando cada um com a mediana da própria conta.
3. Manda os dados para o Claude, que explica o que funcionou e escreve os roteiros de reels.
4. Avisa o dono no WhatsApp. Quando ele responde, recebe o relatório completo: o resumo numa mensagem e cada roteiro em outra.

O prompt original está em [`docs/prompt-original.md`](docs/prompt-original.md). A única mudança foi na Etapa 1: as contas (engajamento, mediana, multiplicador, descartes) agora são feitas pelo código em `src/metricas.ts`, e o Claude recebe os números prontos. Assim os cálculos sempre batem.

## Como funciona

```
Cron da Vercel (segunda, 08:17)
  └─ /api/gerar
       ├─ API da Meta: posts das lojas de referência + posts da RBTech
       ├─ src/metricas.ts: engajamento, mediana, multiplicador, descartes
       ├─ Claude: resumo da semana + roteiros
       ├─ Vercel Blob: guarda o relatório
       └─ WhatsApp: manda o modelo "relatório pronto"

Dono responde no WhatsApp
  └─ /api/whatsapp (webhook)
       └─ manda o relatório em várias mensagens
```

Por que esse vai e volta? O WhatsApp só deixa uma empresa mandar mensagem livre para quem falou com ela nas últimas 24 horas. Fora disso, só com um **modelo de mensagem aprovado** pela Meta. Então o agente manda o modelo, e a resposta do dono abre a janela de 24 horas para o relatório.

Depois de receber, se o dono quiser o relatório de novo, é só mandar **relatório**.

## O que você edita toda semana

| Arquivo | O que é |
|---|---|
| `config/estoque.md` | Produtos, preços e condições da semana. O agente só usa o que estiver aqui. **Atualize antes de segunda.** |
| `config/transcricoes.md` | Opcional: texto falado de reels de referência que você transcreveu. |

Dá para editar pelo próprio GitHub, inclusive no celular. Cada alteração faz a Vercel publicar de novo sozinha.

## O que você configura uma vez

| Arquivo | O que é |
|---|---|
| `config/loja.md` | Sobre a loja: o que vende, diferenciais, público, bairro, tom de voz, @ e WhatsApp. **Troque todos os `{{ }}`**: o agente não roda enquanto houver algum. |
| `config/contas.json` | `contasReferencia`: os @ das lojas que você quer acompanhar (precisam ser contas comerciais ou de criador). `quantidadeRoteiros`, `diasAnalise` (padrão 30) e `postsPorConta` (padrão 50). |

## Passo a passo da instalação

### 1. Instagram (API da Meta)

1. O Instagram da RBTech precisa ser **conta comercial ou de criador**, ligada a uma Página do Facebook.
2. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Business**.
3. Gere um token com as permissões `instagram_basic`, `instagram_manage_insights`, `pages_show_list` e `pages_read_engagement`. Para o token não vencer, use um **usuário do sistema** no Gerenciador de Negócios (Configurações do negócio > Usuários do sistema) e gere o token por ele.
4. Descubra o `IG_USER_ID`: no Explorador da Graph API, chame `me/accounts?fields=instagram_business_account` e copie o `id` de `instagram_business_account`.

### 2. WhatsApp (Cloud API)

1. No mesmo app, adicione o produto **WhatsApp** e cadastre o número que vai enviar os relatórios. Use um número que **não** seja o WhatsApp pessoal do dono.
2. Copie o **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`).
3. Dê ao usuário do sistema a permissão `whatsapp_business_messaging` e gere o token permanente (`WHATSAPP_TOKEN`).
4. No Gerenciador do WhatsApp, crie o modelo de mensagem:
   - Nome: `relatorio_semanal`
   - Categoria: **Utilidade**
   - Idioma: **Português (BR)**
   - Corpo: `Seu relatório de reels da semana ({{1}}) está pronto 🎬 Responda esta mensagem para receber os roteiros.`
   - Exemplo para `{{1}}`: `10/11/2026 a 17/11/2026`

   O modelo precisa ter **exatamente uma variável** no corpo: o agente preenche com o período. Espere a aprovação (costuma levar minutos).
5. O webhook é configurado no passo 4, depois que o projeto estiver na Vercel.

### 3. Vercel

1. Em [vercel.com](https://vercel.com), importe este repositório (Add New > Project).
2. Em **Storage**, crie um **Blob** store e conecte ao projeto. Isso cria a variável `BLOB_READ_WRITE_TOKEN` sozinho.
3. Em **Settings > Environment Variables**, cadastre as variáveis do arquivo [`.env.example`](.env.example):
   - `ANTHROPIC_API_KEY`: a chave da API do Claude ([console.anthropic.com](https://console.anthropic.com)).
   - `META_ACCESS_TOKEN`, `IG_USER_ID`.
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_DESTINATARIOS` (ex.: `5548999999999`).
   - `WHATSAPP_VERIFY_TOKEN`: invente uma senha; ela é usada no passo 4.
   - `META_APP_SECRET`: a chave secreta do app (Configurações > Básico).
   - `CRON_SECRET`: invente uma senha longa. A Vercel usa essa senha para chamar o agente.
4. Publique (Deploy).

### 4. Ligar o webhook do WhatsApp

No app da Meta, em WhatsApp > Configuração:

- URL de retorno: `https://SEU-PROJETO.vercel.app/api/whatsapp`
- Token de verificação: o mesmo `WHATSAPP_VERIFY_TOKEN`
- Clique em **Verificar e salvar** e assine o campo **messages**.

### 5. Testar

Para rodar agora, sem esperar segunda:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-PROJETO.vercel.app/api/gerar
```

Leva alguns minutos. Em seguida chega o aviso no WhatsApp; responda e o relatório chega.

## Rodar no seu computador

Precisa de Node 20 ou mais novo.

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha o `.env` e rode:

```bash
npm run gerar:local
```

Gera o relatório e salva em `saida/`, **sem enviar nada**. Outras opções:

- `npm run gerar:local -- --salvar-dados`: guarda também os dados vindos da Meta em `saida/dados-AAAA-MM-DD.json`.
- `npm run gerar:local -- --dados saida/dados-AAAA-MM-DD.json`: reaproveita esses dados (testa mudanças no prompt sem chamar a Meta de novo).
- `npm run gerar:local -- --enviar`: faz o mesmo que o Cron (salva no Blob e avisa no WhatsApp). Precisa do `BLOB_READ_WRITE_TOKEN`; baixe as variáveis com `vercel env pull .env`.

Testes e checagem de tipos:

```bash
npm test
```

```bash
npm run typecheck
```

## Ajustes comuns

- **Dia e horário**: em `vercel.json`, campo `crons`. O horário é em UTC: `17 11 * * 1` é segunda às 11:17 UTC, 08:17 em Florianópolis.
- **Mandar direto, sem o aviso**: `WHATSAPP_MODO=direto`. Só chega se o dono tiver mandado mensagem para o número nas últimas 24 horas; fora disso, o WhatsApp descarta sem avisar.
- **Tempo limite**: no plano Hobby da Vercel, a função pode rodar por até 300 segundos. Se o relatório não ficar pronto a tempo (erro de timeout nos logs), deixe `CLAUDE_EFFORT=low` ou reduza `quantidadeRoteiros`. No plano Pro, dá para subir `maxDuration` para 800 em `vercel.json`.
- **Modelo**: o padrão é `claude-opus-5-5`, com esforço `medium`. Se o Claude recusar por política, a API tenta de novo num modelo substituto na mesma chamada (fallback do servidor, ativado em `src/claude.ts`).
- **Versão da API da Meta**: `META_GRAPH_VERSION` (padrão `v24.0`). Quando a Meta desativar essa versão, troque pela mais recente.

## Limites conhecidos

- De contas de outras pessoas, a API só entrega curtidas e comentários, sem visualizações. Por isso a viralização é medida por engajamento em relação à mediana da própria conta.
- Contas pessoais não aparecem no `business_discovery`. Contas que escondem as curtidas têm esses posts descartados.
- A detecção de sorteios é por palavras-chave na legenda (`src/metricas.ts`). O Claude é instruído a ignorar os que escaparem.
- Sem transcrição, o Claude deduz formato e gancho só pela legenda e avisa quando for dedução.

## Estrutura

```
api/gerar.ts        rota do Cron: coleta, análise, Claude, aviso no WhatsApp
api/whatsapp.ts     webhook: entrega o relatório quando o dono responde
src/meta.ts         chamadas da API do Instagram
src/metricas.ts     engajamento, mediana, multiplicador e descartes
src/prompt.ts       prompt do sistema e mensagem semanal
src/claude.ts       chamada ao Claude
src/whatsapp.ts     envio, divisão das mensagens e assinatura do webhook
src/armazenamento.ts  relatório no Vercel Blob
config/             informações da loja, estoque, contas de referência
scripts/local.ts    rodar no computador
```
