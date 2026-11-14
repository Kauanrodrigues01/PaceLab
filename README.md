# 🏃‍♂️ PaceLab

Aplicação web completa para **corredores, praticantes de caminhada e candidatos a Testes de Aptidão Física (TAF)**, reunindo calculadoras avançadas de ritmo, planejador intervalado, diário de treinos com estimativa metabólica (Compêndio 2024), importação nativa de arquivos **`.FIT` e `.GPX`** do Strava/Garmin, painel oficial de evolução no TAF de 12 minutos, documentação Swagger/OpenAPI e backup portátil em JSON/CSV.

---

## ✨ Principais Módulos & Funcionalidades

- **🏠 Dashboard Principal (`/`):** Resumo tático com Quick Pace Widget, contagem regressiva para a prova, índice de prontidão multimodal do TAF e atalhos rápidos.
- **⏱️ Calculadora de Pace (`/calculadora`):** Cálculo de ritmo (`min/km`), velocidade (`km/h`), parciais quilômetro a quilômetro, histórico local e conversão para o Diário de Treinos.
- **🏅 Simulador TAF 12 min (`/taf`):** Projeção de distância em 12 minutos (Cooper), régua de aprovação alinhada à meta do edital, tática por volta na pista de 400 m e estimativa de VO2 Máx.
- **⚡ Treino Intervalado (`/intervalado`):** Simulação de aquecimento, tiros, recuperação e desaquecimento com gráfico de perfil de velocidade e modal **Cartão de Pista** de alto contraste.
- **🎯 Estratégias de Metas (`/metas`):** Planejamento de corrida com ritmo constante, *negative split* e progressivo com projeção de parciais.
- **📝 Histórico Local (`/historico`) & 📅 Diário de Treinos (`/treinos`):**
  - Registro de treinos com cálculo calórico pelo **Compêndio de Atividades Físicas 2024 (MET)**.
  - **Importação Unificada `.FIT` (Prioritário) + `.GPX` (Complementar/Fallback):**
    - Suporte a upload isolado (`.fit` ou `.gpx`) ou combinado (`.fit` + `.gpx` do mesmo treino).
    - Extração de telemetria nativa (`avgHeartRate`, `maxHeartRate`, `avgCadence`, `elevationGainM`, `elapsedSeconds`, `activeCalories`), parciais por km (`splits`), detecção indoor/esteira e proteção anti-duplicação (`externalId` SHA-256 / HTTP `409 Conflict`).
    - **Visualizador Analítico de Parciais:** Tabela detalhada, gráfico pace x FC por quilômetro e insights de regularidade / *negative split*.
    - **Conversão / Importação para Simulado TAF:** Recorte automático da melhor janela contínua de 12 minutos sobre os registros GPS/.FIT, incluindo voltas projetadas de 400 m.
- **📈 Meu TAF (`/meu-taf`):** Histórico completo no banco de dados (PostgreSQL/Supabase via Prisma), recordes pessoais, gráfico de evolução dos 12 minutos, comparador de períodos (14d, 30d, mensal), acompanhamento de exercícios complementares (Barra, Flexão, Abdominal) e **Central de Backup v3 & Exportação CSV** (com neutralização contra Formula Injection).
- **👤 Perfil do Atleta (`/perfil`):** Dados biométricos, histórico de pesagens, cálculo de zonas metabólicas e configuração da meta do edital com presets rápidos (PMPR, PF, PRF, PMESP, PCERJ) e tempo opcional por exercício.
- **📘 Documentação Interativa da API (`/docs`):** Swagger UI alimentado dinamicamente pela especificação OpenAPI 3.0 em `/api/docs/spec`.

---

## 🛠️ Stack Tecnológica

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Banco de Dados & ORM:** PostgreSQL (Supabase) + Prisma ORM (`@prisma/client`)
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

Configure `DATABASE_URL` e `DIRECT_URL` em `.env` apontando para o seu banco PostgreSQL (Supabase ou instância local compatível):

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
