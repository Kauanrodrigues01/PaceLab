# 🏃‍♂️ PaceLab

Aplicação web completa para **corredores, praticantes de caminhada e candidatos a Testes de Aptidão Física (TAF)**, reunindo calculadoras avançadas de ritmo, planejador intervalado, diário de treinos com estimativa metabólica (Compêndio 2024), importação nativa de arquivos **`.FIT` e `.GPX`** do Strava/Garmin, painel oficial de evolução no TAF de 12 minutos, documentação Swagger/OpenAPI e backup portátil em JSON/CSV.

---

## ✨ Principais Módulos & Funcionalidades

- **🏠 Dashboard Principal (`/`):** Resumo tático com Quick Pace Widget, contagem regressiva para a prova, índice de prontidão multimodal do TAF, widget **`WeeklyAdherenceCard`** (aderência ao `Plano_Semanal` com navegação semanal, comparativo contra média móvel de 4 semanas e abertura de detalhes do treino) e atalhos rápidos.
- **⏱️ Calculadora de Pace (`/calculadora`):** Cálculo de ritmo (`min/km`), velocidade (`km/h`), parciais quilômetro a quilômetro, histórico local e conversão para o Diário de Treinos.
- **🏅 Simulador TAF 12 min (`/taf`):** Projeção de distância em 12 minutos (Cooper), régua de aprovação alinhada à meta do edital, tática por volta na pista de 400 m e estimativa de VO2 Máx.
- **⚡ Treino Intervalado (`/intervalado`):** Simulação de aquecimento, tiros, recuperação e desaquecimento com gráfico de perfil de velocidade e modal **Cartão de Pista** de alto contraste.
- **🎯 Estratégias de Metas (`/metas`):** Planejamento de corrida com ritmo constante, *negative split* e progressivo com projeção de parciais.
- **📝 Histórico Local (`/historico`) & 📅 Diário de Treinos (`/treinos`):**
  - Registro de treinos com cálculo calórico pelo **Compêndio de Atividades Físicas 2024 (MET)**, espelhamento automático na planilha Google Sheets (`Log_Treinos`), reconciliação automática com a aba **`Plano_Semanal`**, widget **`WeeklyAdherenceCard`** integrado (com deep link `?trainingId=` para o modal de detalhes) e botão **"Sincronizar Planilha"** para sincronização bidirecional rápida.
  - **Importação Unificada `.FIT` (Prioritário) + `.GPX` (Complementar/Fallback):**
    - Suporte a upload isolado (`.fit` ou `.gpx`), combinado (`.fit` + `.gpx` do mesmo treino) e **Importação em Massa (Lote)**.
    - **Importação e Preenchimento em Massa:** Envio de múltiplos arquivos simultaneamente (até 50 atividades por lote) com pareamento automático `.FIT + .GPX` de mesmo nome (e opção de desagrupar), **seleção única global** (*Todos como Treinos do Diário* ou *Todos como Simulados TAF*), preenchimento rápido em massa (tipo de treino/local do teste, peso corporal para MET, tênis e RPE), política configurável para duplicados (*Pular* ou *Atualizar existentes*), resiliência a erros parciais com retry apenas dos falhos e **1 único push consolidado** para Google Sheets ao final.
    - Extração de telemetria nativa (`avgHeartRate`, `maxHeartRate`, `avgCadence`, `elevationGainM`, `elapsedSeconds`, `activeCalories`), parciais por km (`splits`), detecção indoor/esteira e proteção anti-duplicação (`externalId` SHA-256 / HTTP `409 Conflict` / atualização idempotente `onDuplicate`).
    - **Visualizador Analítico de Parciais:** Tabela detalhada, gráfico pace x FC por quilômetro e insights de regularidade / *negative split*.
    - **Conversão / Importação para Simulado TAF:** Recorte automático da melhor janela contínua de 12 minutos sobre os registros GPS/.FIT, incluindo voltas projetadas de 400 m (com espelhamento automático para `Simulados_TAF` e espelho opcional no Diário).
    - **Documentação Técnica do Leitor:** Veja [`docs/architecture/01_leitura_fit_gpx_e_divergencias_strava.md`](docs/architecture/01_leitura_fit_gpx_e_divergencias_strava.md) para detalhes sobre cálculo de pausas/movimento e divergências de métricas com o Strava.
- **📈 Meu TAF (`/meu-taf`):** Histórico completo no banco de dados (PostgreSQL/Supabase via Prisma), recordes pessoais, gráfico de evolução dos 12 minutos, comparador de períodos (14d, 30d, mensal), acompanhamento de exercícios complementares (Barra, Flexão, Abdominal), **Sincronização Bidirecional com Google Sheets (`Treinos_Corrida`)** e **Central de Backup v3 & Exportação CSV** (com neutralização contra Formula Injection).
- **👤 Perfil do Atleta (`/perfil`):** Dados biométricos, histórico de pesagens, cálculo de zonas metabólicas e configuração da meta do edital com presets rápidos (PMPR, PF, PRF, PMESP, PCERJ), sincronizando automaticamente a aba `Perfil_e_Metas` no Google Sheets.
- **📘 Documentação Interativa da API (`/docs`):** Swagger UI alimentado dinamicamente pela especificação OpenAPI 3.0 em `/api/docs/spec` (incluindo os contratos de `/api/sync/sheets` e `/api/weekly-plan`).

---

## 🛠️ Stack Tecnológica

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Banco de Dados & ORM:** PostgreSQL (Supabase) + Prisma ORM (`@prisma/client`)
- **Sincronização em Nuvem (Google Sheets):** `@googleapis/sheets` + `google-auth-library` (Autenticação JWT por *Service Account* em Base64, estritamente *server-side* / compatível com Vercel Serverless)
- **Parsing Esportivo:** `@garmin/fitsdk` (decodificação binária `.FIT`) e `fast-xml-parser` (parsing `.GPX` protegido contra DTD/XXE)
- **Validação & Contratos:** Zod v4 + OpenAPI 3.0 (`swagger-ui-dist`)
- **Estilização & Visualização:** Tailwind CSS v3 (Paleta *Dark Performance Athletics*) + Lucide Icons + Recharts
- **Testes:** Vitest + React Testing Library + `jsdom` + V8 Coverage

---

## 🚀 Como Executar Localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e configure `DATABASE_URL` e `DIRECT_URL` apontando para o seu banco PostgreSQL (Supabase ou instância local compatível). Para habilitar o espelho bidirecional com Google Sheets, configure também `GOOGLE_SHEETS_SPREADSHEET_ID` e `GOOGLE_CREDENTIALS_BASE64` (veja o guia passo a passo na seção **Integração com Google Sheets** abaixo):

```bash
npm run db:check
```

### 3. Iniciar servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) e a documentação da API em [http://localhost:3000/docs](http://localhost:3000/docs).

---

## 🧪 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor Next.js em modo desenvolvimento |
| `npm run build` | Gera o build de produção otimizado (`next build`) |
| `npm run start` | Sobe o servidor Next.js em produção |
| `npm run lint` | Executa análise estática via ESLint (`next lint`) |
| `npm test` | Executa toda a suíte de testes automatizados (`vitest run`) |
| `npm run test:watch` | Executa os testes em modo interativo (*watch*) |
| `npm run test:coverage` | Gera relatório de cobertura V8 (`vitest run --coverage`) |
| `npm run db:check` | Valida conectividade e integridade do banco configurado em `.env` |
| `npm run gpx:inspect` | Ferramenta CLI para inspecionar métricas/splits de arquivos `.GPX` |
| `npm run gpx:test:synthetic` | Executa suíte sintética de validação de parsing `.GPX` |
| `npm run gpx:test:real` | Executa validação em fixtures reais `.GPX` |
| `npm run gpx:gen-fixtures` | Gera fixtures `.GPX` sintéticos para testes |
| `npm run fit:inspect` | Ferramenta CLI para inspecionar métricas, voltas, janela TAF e mesclagem de arquivos `.FIT` |
| `npm run fit:test:synthetic` | Executa suíte sintética de validação binária `.FIT` + teste de merge `.FIT + .GPX` |
| `npm run fit:test:real` | Executa inspeção/validação em arquivos `.FIT` reais em `__tests__/fixtures/fit/strava-real/` |
| `npm run fit:gen-fixtures` | Gera as 10 fixtures `.FIT` sintéticas determinísticas para testes |
| `npx tsc --noEmit` | Checagem estrita de tipos TypeScript em todo o projeto |

---

## 📊 Integração com Google Sheets (`Treinos_Corrida` — Sincronização & Deploy na Vercel)

O PaceLab utiliza o **PostgreSQL (Supabase via Prisma)** como banco de dados primário de alta performance e oferece sincronização completa e bidirecional com uma planilha do Google Sheets (**`Treinos_Corrida`**) atuando como espelho vivo e legível por humanos.

### Como a arquitetura de 4 abas funciona

Quando a integração está configurada, o motor de sincronização mantém uma arquitetura de até quatro abas na planilha (criando e formatando automaticamente os cabeçalhos das 3 abas principais — sem duplicar linhas — e integrando a aba opcional `Plano_Semanal` quando ela existir):

1. **`Log_Treinos`:** Espelho completo dos treinos registrados no diário (`TrainingSession`), incluindo `ID` (coluna `A`), data, origem (`manual`, `gpx_upload`, `fit_upload`, `sheets`), tipo, distância, tempo em movimento, pace médio, FC média/máx, elevação, cadência, RPE, peso, tênis e observações.
   - *Push (Banco → Sheets):* Faz *upsert* idempotente usando a coluna `ID`.
   - *Pull (Sheets → Banco):* Permite inserir novos treinos diretamente na planilha (o PaceLab cria o registro no PostgreSQL, gera o ID e grava de volta na coluna `ID`) e editar células seguras de treinos existentes sem provocar exclusões em cascata.
2. **`Simulados_TAF`:** Espelho dos simulados de 12 minutos (`TafAttempt`), contendo as colunas `ID` (coluna `A`), `Data`, `Local`, `Tempo Alvo (s)`, `Tempo Real (s)`, `Distância (m)`, `Pace (min/km)`, `Vel. (km/h)`, `Status Meta` (`Meta Segurança Atingida`, `Aprovado (Mínimo)` ou `Abaixo do Mínimo`) e `Observações`.
3. **`Perfil_e_Metas`:** Snapshot determinístico em linha única (`A2:I2`) com `Nome`, `Idade`, `Altura (cm)`, `Peso Atual (kg)`, `Edital Alvo`, `Distância Mínima (m)`, `Distância Alvo (m)`, `Tempo Prova (min)` e `Data Prova`, atualizado sem gerar linhas duplicadas.
4. **`Plano_Semanal` *(opcional)*:** Plano semanal de treinos prescritos (por exemplo, pelo seu Treinador IA) com as 9 colunas **`A..I`**: `ID`, `Data`, `Dia da Semana`, `Tipo`, `Distância Alvo (km)`, `Pace Alvo (min/km)`, `Descrição / Observação`, `Status` (`Planejado`, `Concluído`, `Parcial`, `Perdido`) e `ID Treino Realizado`. Se a aba ainda não existir na planilha, a sincronização segue normalmente sem erro até que você (ou seu Treinador IA) a crie com esse cabeçalho.
   - *Reconciliação automática em 2 passadas (`America/Fortaleza`):*
     - **Passada 1 (`D+0`):** vincula treinos livres do mesmo dia com modalidade compatível, aplicando corte mínimo de **40%** da distância alvo antes do ranking (`Concluído` ≥ 85% ou sem meta numérica; `Parcial` entre 40% e 84,9%).
     - **Passada 2 (`±1 dia`):** vincula treinos realizados no dia anterior ou posterior **apenas** quando o dia do treino realizado não possui outro plano ativo registrado.
     - Itens não vinculados só recebem `Perdido` quando `Data < ontem`; dias de `Descanso` são preservados; exclusões de treinos desvinculam órfãos e devolvem o item para `Planejado`/`Perdido`.
   - *Write-back & Visualização (`WeeklyAdherenceCard`):* Atualiza exclusivamente as colunas `H` (`Status`) e `I` (`ID Treino Realizado`) de volta na planilha (preservando `A..G`) e alimenta o widget **`WeeklyAdherenceCard`** em `/` e `/treinos` com navegação semanal, aderência consolidada, média móvel de até 4 semanas com plano, treinos extras e abertura do modal de detalhes.

> **Nota:** Se as variáveis do Google Sheets não estiverem preenchidas, o PaceLab continua funcionando normalmente com o PostgreSQL/Supabase e ignora o espelhamento de forma graciosa.

---

### Passo 1 — Criar o projeto e ativar a Google Sheets API

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um novo projeto (ex.: `pacelab-sheets`) ou selecione um projeto existente.
3. No menu lateral, acesse **APIs e Serviços → Biblioteca**.
4. Pesquise por **`Google Sheets API`** e clique em **Ativar**.

### Passo 2 — Criar uma Conta de Serviço (*Service Account*) e baixar a chave `.json`

1. No Google Cloud Console, acesse **IAM e administrador → Contas de serviço**.
2. Clique em **+ Criar conta de serviço**, informe um nome (ex.: `pacelab-sheets-sync`) e conclua a criação (não é necessário atribuir papéis de IAM no projeto do GCP).
3. Clique sobre a conta de serviço recém-criada, abra a aba **Chaves** e selecione **Adicionar chave → Criar nova chave → JSON**.
4. Salve o arquivo `.json` baixado temporariamente em sua máquina (ele contém campos como `client_email` e `private_key`).

### Passo 3 — Criar/abrir a planilha `"Treinos_Corrida"`, copiar o ID e compartilhar

1. Acesse o [Google Sheets](https://sheets.google.com/) e crie uma nova planilha chamada **`Treinos_Corrida`** (ou abra a sua planilha existente).
2. Copie o **ID da planilha** diretamente da barra de endereço do navegador:
   ```text
   https://docs.google.com/spreadsheets/d/ESTE_TRECHO_E_O_ID_DA_PLANILHA/edit
   ```
   Esse valor será usado em `GOOGLE_SHEETS_SPREADSHEET_ID`.
3. Clique no botão **Compartilhar** (canto superior direito da planilha).
4. Cole o valor de **`client_email`** da sua Conta de Serviço (encontrado dentro do `.json`, no formato `...@...iam.gserviceaccount.com`).
5. Defina a permissão como **Editor**, **desmarque** *"Notificar pessoas"* (contas de serviço não recebem e-mails) e confirme o compartilhamento.

> As abas principais `Log_Treinos`, `Simulados_TAF` e `Perfil_e_Metas` serão criadas e formatadas automaticamente pelo PaceLab na primeira sincronização — você não precisa criar cabeçalhos manualmente. Já a aba opcional `Plano_Semanal` pode ser criada manualmente ou pelo seu Treinador IA seguindo o cabeçalho `A..I` descrito acima (caso ela ainda não exista, a sincronização segue normalmente sem erro).

### Passo 4 — Converter o arquivo `.json` para Base64 em linha única

A autenticação no PaceLab aceita a credencial codificada em **Base64 em linha única** via `GOOGLE_CREDENTIALS_BASE64`, eliminando a necessidade de gravar arquivos `.json` no disco e evitando quebras de formatação da `private_key` em ambientes Serverless (como a Vercel).

Execute **um** dos comandos abaixo apontando para a sua chave baixada (por exemplo `google-key.json`, padrão já coberto pelo `.gitignore`):

- **Node.js (multiplataforma — recomendado):**
  ```bash
  node -e "const fs = require('fs'); console.log(fs.readFileSync('google-key.json').toString('base64'));"
  ```
- **Linux (GNU coreutils):**
  ```bash
  base64 -w 0 google-key.json
  ```
- **macOS (BSD):**
  ```bash
  base64 -i google-key.json | tr -d '\n'
  ```
- **Windows (PowerShell):**
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes(".\google-key.json"))
  ```

Copie toda a string Base64 gerada (sem quebras de linha e sem aspas extras internas).

### Passo 5 — Configurar as variáveis no `.env` local e na Vercel

#### Ambiente Local (`.env`)
Com base no arquivo `.env.example`, adicione ou atualize em `.env`:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
GOOGLE_SHEETS_SPREADSHEET_ID="seu_spreadsheet_id_aqui"
GOOGLE_CREDENTIALS_BASE64="sua_string_base64_em_linha_unica_aqui"
```

#### Deploy na Vercel (*Environment Variables*)
1. Abra o painel do projeto na **Vercel** e vá em **Settings → Environment Variables**.
2. Adicione as variáveis obrigatórias do banco (`DATABASE_URL` e `DIRECT_URL`) e as variáveis da planilha:
   - **`GOOGLE_SHEETS_SPREADSHEET_ID`** = ID copiado da URL da planilha.
   - **`GOOGLE_CREDENTIALS_BASE64`** = String Base64 em linha única gerada no Passo 4.
3. Marque os três ambientes (**Production**, **Preview** e **Development**) antes de salvar e faça um novo *Redeploy* para aplicar as variáveis em runtime.

### Passo 6 — Boas práticas de segurança

- **Exclua o arquivo `.json` original** da pasta Downloads/Área de trabalho após gerar e salvar o Base64 (ou mova-o para um cofre de senhas fora do projeto).
- **Nunca faça commit** de arquivos `.json` de Service Account nem do `.env` para o Git (o `.gitignore` já ignora `.env` por padrão).
- **Isolamento *Server-Side*:** O cliente `@googleapis/sheets` e `google-auth-library` é executado exclusivamente nas rotas de API e serviços *server-side* do Next.js (Node.js runtime), nunca sendo empacotado nos chunks client-side do navegador nem expondo chaves na resposta das APIs.

### Passo 7 — Como operar a sincronização no PaceLab

- **Sincronização automática (*Best-Effort*):** Toda criação, edição ou exclusão em treinos (`/api/taf/trainings`), simulados 12 min (`/api/taf/attempts`), metas (`/api/taf/goals`) e perfil/peso (`/api/profile`, `/api/profile/weight`) dispara automaticamente o espelhamento para a planilha em segundo plano. Em caso de falha externa temporária, o PostgreSQL permanece 100% íntegro e o item fica marcado como pendente para reenvio.
- **Em `/treinos`:** Use o botão **"Sincronizar Planilha"** no topo da lista para executar uma sincronização bidirecional rápida e acompanhar o badge discreto de sincronização por treino.
- **Em `/meu-taf` (aba `Meta & Banco`):**
  - Acompanhe o indicador de configuração (**`Configurada` / `Não configurada`**) e o quadro **Status de Pendências de Envio**;
  - Clique em **"Sincronizar Agora (Bidirecional)"** para enviar pendências ao Sheets e puxar novidades editadas na planilha;
  - Clique em **"Reenviar Histórico Completo (Full Backfill)"** (e confirme no alerta) quando quiser reenviar todos os registros históricos do banco para a planilha de forma idempotente.
- **API REST (`/api/sync/sheets` e `/api/weekly-plan`):**
  - `GET /api/sync/sheets`: retorna `configured`, `error` (se não configurada) e contagens pendentes (`pendingTrainingsCount`, `pendingAttemptsCount`, `totalPendingCount`) sem expor credenciais;
  - `POST /api/sync/sheets`: aceita `{ "direction": "bidirectional" | "push" | "pull", "forceFullResync": boolean }` e retorna o relatório completo da sincronização (`syncedAt`, contagens incluindo `weeklyPlan` e `warnings`), documentado em `/docs`;
  - `GET /api/weekly-plan?weekStart=YYYY-MM-DD`: retorna os itens prescritos da semana em `America/Fortaleza`, resumo de aderência, média móvel de até 4 semanas com plano, sessões vinculadas completas e treinos extras fora do plano.
