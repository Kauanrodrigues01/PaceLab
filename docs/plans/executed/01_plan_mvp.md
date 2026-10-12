# PaceLab — Plano de Implementação Completo

> MVP de calculadoras de corrida em Next.js + TypeScript + Tailwind CSS

---

## Visão Geral

| Item | Decisão |
|---|---|
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript strict |
| Estilo | Tailwind CSS v3 |
| Ícones | Lucide React |
| Testes | Vitest + React Testing Library |
| Deploy | Vercel |
| Persistência | localStorage (sem backend no MVP) |
| Auth | Nenhuma |
| API externa | Nenhuma |

---

## Estrutura de Pastas

```
pacelab/
├── app/
│   ├── layout.tsx                  # Root layout (tema, fonte, metadados)
│   ├── page.tsx                    # Home — lista de calculadoras
│   ├── calculadora/
│   │   └── page.tsx                # Calculadora principal
│   ├── medias/
│   │   └── page.tsx                # Médias de paces
│   ├── taf/
│   │   └── page.tsx                # TAF
│   ├── metas/
│   │   └── page.tsx                # Metas e parciais
│   ├── intervalado/
│   │   └── page.tsx                # Simulador intervalado
│   └── historico/
│       └── page.tsx                # Histórico
│
├── components/
│   ├── ui/
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── ResultBlock.tsx
│   │   └── ThemeToggle.tsx
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── BottomNav.tsx
│   └── charts/
│       └── PaceBarChart.tsx        # Gráfico de parciais (recharts)
│
├── lib/
│   ├── math/
│   │   ├── pace.ts                 # Funções core de cálculo
│   │   ├── taf.ts                  # Cálculos do TAF
│   │   ├── intervals.ts            # Treino intervalado
│   │   └── averages.ts             # Médias de paces
│   ├── validation/
│   │   └── inputs.ts               # Validadores de entrada
│   ├── formatting/
│   │   └── time.ts                 # Formatadores de tempo
│   └── storage/
│       └── localStorage.ts         # Abstração de persistência
│
├── types/
│   └── index.ts                    # Tipos compartilhados
│
├── hooks/
│   ├── useTheme.ts
│   └── useLocalStorage.ts
│
├── __tests__/
│   ├── lib/
│   │   ├── pace.test.ts
│   │   ├── taf.test.ts
│   │   ├── intervals.test.ts
│   │   ├── averages.test.ts
│   │   ├── formatting.test.ts
│   │   └── validation.test.ts
│   └── components/
│       ├── Input.test.tsx
│       └── ResultBlock.test.tsx
│
├── public/
│   └── favicon.ico
│
├── tailwind.config.ts
├── vitest.config.ts
├── tsconfig.json
├── next.config.ts
├── package.json
└── README.md
```

---

## Fases de Implementação

### Fase 0 — Setup do Projeto *(~1 hora)*

**Objetivo:** Projeto compilando, linting e testes rodando antes de qualquer feature.

#### Tarefas

- [x] Inicializar projeto com `create-next-app@14` (App Router, TypeScript, Tailwind)
- [x] Configurar `tsconfig.json` com `strict: true`
- [x] Instalar dependências:
  ```bash
  npm install lucide-react recharts
  npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
  ```
- [x] Configurar `vitest.config.ts`
- [x] Configurar `next-themes` para dark/light mode
- [x] Criar script `test` no `package.json`
- [x] Configurar aliases de importação (`@/lib`, `@/components`, etc.)
- [x] Verificar: `npm run build` e `npm test` passam sem erros

#### Critério de aceite
- [x] `npm run dev` sobe sem erros (HTTP 200 em localhost:3000)
- [x] `npm test` executa e retorna 0 failures (2/2 testes passando)
- [x] `npm run build` compila sem warnings (11/11 páginas geradas)

---

### Fase 1 — Núcleo Matemático + Testes *(~2 horas)* — ✅ CONCLUÍDA

**Objetivo:** Implementar e testar 100% das funções de cálculo antes de qualquer UI.

> Status: **91 testes passando (0 falhas)** | **Cobertura global de 96.3% (100% em funções)**

#### 1.1 — Tipos (`types/index.ts`)

```typescript
export type Seconds = number;
export type Kilometers = number;
export type KmPerHour = number;
export type SecondsPerKm = number;

export interface PaceResult {
  paceSeconds: SecondsPerKm;
  paceFormatted: string;       // "6:40"
  speedKmh: KmPerHour;
}

export interface TafResult {
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  speedKmh: KmPerHour;
  distancePerMinute: Kilometers;
  splits: TafSplit[];
}

export interface TafSplit {
  lap: number;
  distance: Kilometers;
  accumulatedDistance: Kilometers;
  lapTime: Seconds;
  lapTimeFormatted: string;
  accumulatedTime: Seconds;
  progressPercent: number;
}

export interface IntervalSession {
  totalTime: Seconds;
  totalDistance: Kilometers;
  averageSpeedKmh: KmPerHour;
  averagePaceSeconds: SecondsPerKm;
  averagePaceFormatted: string;
  stages: IntervalStage[];
}

export interface IntervalStage {
  index: number;
  type: 'warmup' | 'run' | 'walk' | 'cooldown';
  durationSeconds: Seconds;
  speedKmh: KmPerHour;
  distanceKm: Kilometers;
  paceFormatted: string;
}

export interface HistoryEntry {
  id: string;
  date: string;               // ISO 8601
  distanceKm: Kilometers;
  timeSeconds: Seconds;
  paceSeconds: SecondsPerKm;
  paceFormatted: string;
  speedKmh: KmPerHour;
  notes?: string;
}

export interface PaceAverageResult {
  count: number;
  averagePaceSeconds: SecondsPerKm;
  averagePaceFormatted: string;
  speedKmh: KmPerHour;
  fastestPaceSeconds: SecondsPerKm;
  fastestPaceFormatted: string;
  slowestPaceSeconds: SecondsPerKm;
  slowestPaceFormatted: string;
  differenceSeconds: Seconds;
  differenceFormatted: string;
  estimatedTimes: Record<string, string>;  // "1.6km" -> "9:44"
}
```

#### 1.2 — Formatadores (`lib/formatting/time.ts`)

| Função | Descrição |
|---|---|
| `formatPace(seconds: number): string` | `400` → `"6:40"` |
| `parsePace(str: string): number` | `"6:40"` → `400` |
| `formatTime(seconds: number): string` | `3661` → `"1:01:01"` |
| `parseTime(str: string): number` | `"1:01:01"` → `3661` |
| `formatDecimal(n: number, places: number): string` | `9.0` → `"9.0"` |

#### 1.3 — Funções Core (`lib/math/pace.ts`)

| Função | Entradas | Saída |
|---|---|---|
| `calcPaceFromDistanceAndTime(distKm, timeSeconds)` | número, número | `PaceResult` |
| `calcSpeedFromPace(paceSeconds)` | número | `number` (km/h) |
| `calcPaceFromSpeed(speedKmh)` | número | `SecondsPerKm` |
| `calcTimeForDistance(distKm, paceSeconds)` | número, número | `Seconds` |
| `calcDistanceFromTimeAndSpeed(timeSeconds, speedKmh)` | número, número | `Kilometers` |

#### 1.4 — Médias (`lib/math/averages.ts`)

| Função | Descrição |
|---|---|
| `calcAveragePaces(paceStrings: string[])` | Média simples (trechos iguais) |
| `calcWeightedAveragePaces(entries: {pace: string, distance: number}[])` | Média ponderada |

#### 1.5 — TAF (`lib/math/taf.ts`)

| Função | Descrição |
|---|---|
| `calcTaf(durationMinutes, targetMeters, splitEveryMeters)` | Retorna `TafResult` |

#### 1.6 — Intervalado (`lib/math/intervals.ts`)

| Função | Descrição |
|---|---|
| `calcIntervalSession(config: IntervalConfig)` | Retorna `IntervalSession` |

#### 1.7 — Validação (`lib/validation/inputs.ts`)

| Função | Descrição |
|---|---|
| `validateDistance(value)` | > 0, finito |
| `validateTime(value)` | > 0, finito |
| `validatePaceString(str)` | Formato MM:SS, segundos < 60 |
| `validateSpeed(value)` | > 0, <= 100 |

---

### Fase 1 — Testes Unitários

**Arquivo:** `__tests__/lib/pace.test.ts`

```typescript
// Caso do enunciado: 3 km em 20 min = 9 km/h e pace 6:40
describe('calcPaceFromDistanceAndTime', () => {
  it('3km em 20min → pace 6:40 e velocidade 9 km/h', () => {
    const result = calcPaceFromDistanceAndTime(3, 20 * 60);
    expect(result.paceFormatted).toBe('6:40');
    expect(result.speedKmh).toBeCloseTo(9.0, 1);
  });

  it('rejeita distância zero', () => {
    expect(() => calcPaceFromDistanceAndTime(0, 600)).toThrow();
  });

  it('rejeita tempo negativo', () => {
    expect(() => calcPaceFromDistanceAndTime(5, -100)).toThrow();
  });
});

describe('parsePace', () => {
  it('"6:40" → 400 segundos', () => {
    expect(parsePace('6:40')).toBe(400);
  });
  it('"8:30" → 510 segundos', () => {
    expect(parsePace('8:30')).toBe(510);
  });
  it('formato inválido lança erro', () => {
    expect(() => parsePace('abc')).toThrow();
  });
});

describe('calcAveragePaces', () => {
  // Caso do enunciado
  const paces = ['6:13','6:33','6:14','6:55','7:34','6:11','7:15','6:02','7:13'];
  it('calcula média corretamente', () => {
    const result = calcAveragePaces(paces);
    expect(result.count).toBe(9);
    // Verificar que o pace médio está entre 6:30 e 6:45
    expect(result.averagePaceSeconds).toBeGreaterThan(390);
    expect(result.averagePaceSeconds).toBeLessThan(410);
  });
});

describe('calcTaf', () => {
  it('TAF 12 min / 2300m → pace correto', () => {
    const result = calcTaf(12, 2300, 400);
    // 2300m em 12 min = 11.5 km/h
    expect(result.speedKmh).toBeCloseTo(11.5, 1);
    expect(result.splits.length).toBeGreaterThanOrEqual(5);
  });
});
```

**Cobertura mínima esperada:** 90% das funções em `lib/math/` e `lib/formatting/`

---

### Fase 2 — Componentes Base da UI *(~2 horas)* — ✅ CONCLUÍDA

**Objetivo:** Design system funcional e acessível.

> Status: **108 testes passando (0 falhas)** | **Todos os componentes testados** | **Build 100% limpo**

#### Componentes Implementados

| Componente | Arquivo | Status |
|---|---|:---:|
| `Card` | `components/ui/Card.tsx` | ✅ |
| `Input` | `components/ui/Input.tsx` | ✅ |
| `Button` | `components/ui/Button.tsx` | ✅ |
| `ResultBlock` | `components/ui/ResultBlock.tsx` | ✅ |
| `Badge` | `components/ui/Badge.tsx` | ✅ |
| `CopyButton` | `components/ui/CopyButton.tsx` | ✅ |
| `ThemeToggle` | `components/ui/ThemeToggle.tsx` | ✅ |
| `Navbar` | `components/layout/Navbar.tsx` | ✅ |
| `BottomNav` | `components/layout/BottomNav.tsx` | ✅ |
| `PaceBarChart` | `components/charts/PaceBarChart.tsx` | ✅ |

#### Critério de aceite
- [x] Tema claro e escuro funcional com transição suave e sem hydration mismatch
- [x] Todos os componentes renderizam sem erros de TypeScript (`tsc --noEmit` limpo)
- [x] `npm run build` gerando todas as rotas sem erros nem warnings
- [x] Testes de componentes cobrindo interações, acessibilidade e erros

---

### Fase 3 — Calculadora Principal *(~1,5 hora)* — ✅ CONCLUÍDA

**Arquivo:** `app/calculadora/page.tsx`

> Status: **5 modos de cálculo implementados** | **Testes em `__tests__/pages/calculadora.test.tsx` passando** | **Build e dev server 200 OK**

#### Modos de Cálculo Implementados
- [x] **Pace & Velocidade:** entrada distância (km) + tempo total (MM:SS, HH:MM:SS ou minutos). Exemplo: 3 km em 20 min $\rightarrow$ pace 6:40 e 9.0 km/h.
- [x] **Pace → Velocidade:** conversão direta de pace em km/h. Exemplo: 6:40 $\rightarrow$ 9.00 km/h.
- [x] **Velocidade → Pace:** conversão direta de km/h em pace. Exemplo: 9 km/h $\rightarrow$ 6:40 min/km.
- [x] **Tempo Necessário:** distância + pace ou velocidade $\rightarrow$ tempo previsto.
- [x] **Distância Percorrida:** tempo + velocidade ou pace $\rightarrow$ distância em km.

#### Recursos de UX Entregues
- [x] Atalhos rápidos de distância (1 km, 3 km, 5 km, 10 km, 21.1 km, 42.2 km)
- [x] Validação em tempo real com mensagens em português
- [x] Botões de Calcular, Limpar e Copiar Resultados
- [x] Ação rápida de salvar o treino calculado no Histórico local
- [x] Card explicativo contextual "O que é Pace?"

---

### Fase 4 — Calculadora de Médias *(~1,5 hora)* — ✅ CONCLUÍDA

**Arquivo:** `app/medias/page.tsx`

> Status: **Cálculo simples e ponderado implementados** | **Testes em `__tests__/pages/medias.test.tsx` passando (100%)** | **Gráfico de parciais Recharts responsivo** | **Build e dev server 200 OK**

#### Recursos Entregues
- [x] Textarea para múltiplos paces (um por linha ou separados por vírgula), aceitando `MM:SS` e minutos inteiros (ex: `6`)
- [x] Exemplo pré-carregado do enunciado com 9 parciais (6:13 a 7:13)
- [x] Toggle dinâmico para "Distâncias Variáveis por Parcial" com adição/remoção de linhas para média ponderada
- [x] Aviso visual claro sobre a premissa de trechos iguais quando as distâncias não são informadas
- [x] Métricas completas: Pace Médio Geral, Velocidade Média, Mais Rápido, Mais Lento e Amplitude/Oscilação
- [x] Tabela de Projeção de Tempos Estimados (1 km, 1,6 km Milha/TAF, 2 km, 2,3 km TAF, 3 km, 5 km, 10 km)
- [x] Gráfico interativo de barras de parciais (`PaceBarChart`) com destaque da parcial mais rápida
- [x] Botões para Copiar Resumo e Salvar Atividade no Histórico local

---

### Fase 5 — Calculadora de TAF *(~1,5 hora)* — ✅ CONCLUÍDA

**Arquivo:** `app/taf/page.tsx`

> Status: **TAF Tempo Fixo e Distância Fixa implementados** | **Testes em `__tests__/pages/taf.test.tsx` passando (100%)** | **Tabela de voltas na pista de 400m** | **Aviso legal e barra de progresso ativos**

#### Recursos Entregues
- [x] Modo Tempo Fixo (ex: 12 min com meta de 2.300 m) com atalhos de distância e intervalos de parciais
- [x] Subtab para Distância Fixa + Tempo Máximo Permitido (ex: 2.400 m em até 12:00)
- [x] Cálculo automático de pace obrigatório, velocidade média mínima e tempo por volta de pista (400m)
- [x] Tabela de splits volta a volta: volta, trecho, acumulado, tempo da volta, tempo acumulado e % da meta
- [x] Barra de progresso visual com indicador de Apto / Abaixo da Meta e déficit de metros
- [x] Aviso legal de responsabilidade: *"Estes valores são parâmetros de cálculo e não garantem aprovação em concurso público"*
- [x] Card contextual com dica tática para provas de pista de atletismo
- [x] Ações de Copiar Estratégia e Salvar no Histórico local

---

### Fase 6 — Calculadora de Metas e Parciais *(~1 hora)* — ✅ CONCLUÍDA

**Arquivo:** `app/metas/page.tsx`

> Status: **Metas por Pace-alvo e Tempo-alvo implementadas** | **Testes em `__tests__/pages/metas.test.tsx` passando (100%)** | **Planilha de splits estratégicos (400m, 500m, 1km)** | **Histórico e cópia ativos**

#### Recursos Entregues
- [x] Configuração de distância da prova com atalhos rápidos (1 km a 42.2 km maratona)
- [x] Alternância entre Pace-Alvo (aceita MM:SS e inteiros como `5`) e Tempo-Alvo (MM:SS, HH:MM:SS)
- [x] Seletor de intervalo de parciais: 400m (pista), 500m e 1 km (padrão)
- [x] Planilha detalhada de splits com número da parcial, trecho, distância acumulada, tempo da volta e tempo acumulado de prova
- [x] Destaque para a linha de chegada na última parcial
- [x] Métricas consolidadas: Tempo Total Alvo, Pace Alvo Médio e Velocidade Equivalente
- [x] Card contextual com dica de estratégia de ritmo constante vs fadiga precoce
- [x] Ações de Copiar Planilha, Copiar Resumo e Salvar Meta no Histórico local

---

### Fase 7 — Simulador de Corrida Intervalada *(~1,5 hora)* — ✅ CONCLUÍDA

**Arquivo:** `app/intervalado/page.tsx`

> Status: **Simulação de treino HIIT/intervalado implementada** | **Testes em `__tests__/pages/intervalado.test.tsx` passando (100%)** | **Quadro detalhado de etapas com badges** | **Histórico e cópia ativos**

#### Recursos Entregues
- [x] Configuração completa de 5 fases: Aquecimento, Tiros de Corrida (fase forte), Recuperação/Caminhada, Repetições/Séries e Desaquecimento
- [x] Aceita tempos em minutos inteiros, decimais (ex: 1.5) ou formato MM:SS (ex: 1:30)
- [x] Botão para "Carregar Exemplo" de treino clássico (6x tiros com recuperação)
- [x] Balanço total da sessão: Duração Total, Volume de Distância (km), Pace Médio Geral e Velocidade Média Ponderada
- [x] Quadro de etapas detalhado com badges temáticos (Aquecimento, Tiro Rápido, Recuperação, Desaquecimento)
- [x] Card contextual sobre benefícios do treino intervalado e VO2 máx
- [x] Ações de Copiar Quadro de Etapas, Copiar Resumo e Salvar Sessão no Histórico local

---

### Fase 8 — Histórico *(~1,5 hora)*

**Arquivo:** `app/historico/page.tsx`

#### Funcionalidades
- [x] Formulário de adição: data, distância, tempo, notas
- [x] Auto-cálculo de pace e velocidade em tempo real ao preencher distância+tempo
- [x] Lista de registros em cards, ordenada por data decrescente
- [x] Edição inline com recálculo automático
- [x] Exclusão com confirmação
- [x] Limpar histórico completo
- [x] Exportação CSV e JSON com download nativo
- [x] Aviso sobre armazenamento 100% local no navegador (`localStorage`)
- [x] Suíte de testes em `__tests__/pages/historico.test.tsx` com 9 testes

#### Storage (`lib/storage/localStorage.ts`)

```typescript
export interface StorageAdapter<T> {
  getAll(): T[];
  getById(id: string): T | undefined;
  save(item: T): void;
  update(id: string, item: Partial<T>): void;
  remove(id: string): void;
  delete(id: string): void;
  clear(): void;
  exportJson(): string;
  exportCsv(headers: string[], rowMapper: (item: T) => string[]): string;
  importJson(jsonString: string): boolean;
}
```

> **Nota de arquitetura:** Ao introduzir Supabase no futuro, basta criar `SupabaseAdapter<T>` implementando a mesma interface, sem alterar os componentes.

---

### Fase 9 — Home e Navegação *(~30 min)*

**Arquivo:** `app/page.tsx`

- [x] Hero section com apresentação e badge do PaceLab
- [x] CTAs de atalho rápido para Calculadora e Simulador de TAF
- [x] Grid responsivo com cards modernos para cada uma das 6 ferramentas com gradientes e badges
- [x] Seção de diferenciais: Validação em Tempo Real, 100% Privado e Seguro, Mobile & Desktop
- [x] Navegação inferior fixa no mobile (BottomNav) e Navbar fixa no topo com ThemeToggle
- [x] Suíte de testes em `__tests__/pages/home.test.tsx` com 4 testes

---

### Fase 10 — Polimento e Testes Finais *(~1 hora)*

- [x] Revisar todos os resultados com os exemplos do enunciado (testes dedicados em `__tests__/qa/enunciado_exemplos.test.ts` com 5/5 aprovados)
- [x] Testar dark/light em mobile e desktop com ThemeToggle e classes dark do Tailwind
- [x] Verificar acessibilidade básica (labels, contraste, foco, aria-invalid, aria-describedby)
- [x] `npm run build` sem warnings (11 rotas estáticas geradas com sucesso)
- [x] `npm test -- --coverage` com cobertura ≥ 90% nas funções de `lib/` (96.37% linhas, 91.17% branches, 100% funções)
- [x] Testar exportação CSV/JSON e importação no Excel (prefixo BOM UTF-8 `\uFEFF` adicionado)
- [x] Revisar README com instruções completas de instalação, testes e deploy na Vercel

---

## Estratégia de Testes

### Testes Unitários (Vitest)

| Arquivo de teste | O que cobre |
|---|---|
| `pace.test.ts` | calcPace, calcSpeed, conversões, validações de edge case |
| `taf.test.ts` | calcTaf, parciais, projeções |
| `averages.test.ts` | média simples, média ponderada, projeções de distância |
| `intervals.test.ts` | sessão intervalada, totais, etapas |
| `formatting.test.ts` | parsePace, formatPace, parseTime, formatTime |
| `validation.test.ts` | todos os validadores, valores limites |
| `localStorage.test.ts` | save, getAll, update, remove, exportCsv, exportJson |
| `Input.test.tsx` | rendering, onChange, error state |
| `ResultBlock.test.tsx` | rendering com e sem highlight |

### Casos de Teste Obrigatórios (exemplos do enunciado)

| Entrada | Saída esperada |
|---|---|
| 3 km em 20 min | Pace 6:40, velocidade 9,0 km/h |
| Pace 6:40 → velocidade | 9,0 km/h |
| 9 km/h → pace | 6:40 |
| TAF 12 min / 2300 m | 11,5 km/h, pace 5:13 |
| Paces: 6:13..7:13 (9 valores) | Count 9, médias corretas |

### Sem Testes de Integração no MVP
Como não há backend, **não há testes de integração necessários** nesta versão. A abstração `StorageAdapter` isola o localStorage e pode ser testada com mock em memória.

> Quando o Supabase for integrado: adicionar testes de integração para `SupabaseAdapter` usando um banco de teste ou Supabase local via Docker.

---

## Comandos Essenciais

```bash
# Instalação
npm install

# Desenvolvimento
npm run dev

# Testes
npm test
npm test -- --coverage
npm test -- --watch

# Build
npm run build
npm start

# Deploy (Vercel CLI)
npx vercel --prod
```

---

## Deploy na Vercel

1. Fazer push do projeto para GitHub/GitLab
2. Importar repositório em [vercel.com](https://vercel.com)
3. Framework: **Next.js** (detectado automaticamente)
4. Sem variáveis de ambiente necessárias no MVP
5. Deploy automático a cada push na branch `main`

---

## Estimativa de Tempo Total

| Fase | Estimativa |
|---|---|
| 0 — Setup | 1h |
| 1 — Matemática + Testes | 2h |
| 2 — Componentes UI | 2h |
| 3 — Calculadora Principal | 1,5h |
| 4 — Médias | 1,5h |
| 5 — TAF | 1,5h |
| 6 — Metas | 1h |
| 7 — Intervalado | 1,5h |
| 8 — Histórico | 1,5h |
| 9 — Home + Navegação | 0,5h |
| 10 — Polimento + QA | 1h |
| **Total** | **~16h** |

---

## Preparação para Evoluções Futuras

| Evolução | O que já está preparado |
|---|---|
| Supabase sync | `StorageAdapter<T>` interface desacoplada |
| Auth/Login | Layout sem dependência de usuário logado |
| PWA offline | Next.js permite adicionar `next-pwa` sem refatoração |
| Notificações de treino | Estrutura de stages do intervalado é reutilizável |
| i18n | Strings em português isoladas (fácil extrair para arquivos de tradução) |

---

*Plano gerado em 11/10/2026 — PaceLab MVP v1.0*
