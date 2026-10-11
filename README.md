# PaceLab 🏃

Calculadoras de corrida para corredores: pace, velocidade, TAF, metas e treinos intervalados.

Desenvolvido em Next.js + TypeScript + Tailwind CSS. Sem banco de dados, sem login, sem API externa.

---

## Calculadoras disponíveis

| Calculadora | Descrição |
|---|---|
| **Calculadora Principal** | Pace, velocidade, tempo e distância |
| **Médias de Paces** | Média de parciais com gráfico |
| **TAF** | Planejamento para testes físicos |
| **Metas e Parciais** | Planejamento de corridas com splits |
| **Treino Intervalado** | Simulador de corrida intervalada |
| **Histórico** | Registro local de atividades |

---

## Instalação e execução local

### Pré-requisitos

- Node.js 18 ou superior
- npm 9 ou superior

### Passos

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/pacelab.git
cd pacelab

# Instalar dependências
npm install

# Iniciar em modo desenvolvimento
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Scripts disponíveis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm start            # Servidor de produção (após build)
npm run lint         # Verificar erros de lint
npm test             # Executar todos os testes
npm run test:watch   # Testes em modo watch
npm run test:coverage  # Testes com relatório de cobertura
```

---

## Testes

Utilizamos **Vitest** + **React Testing Library**.

```bash
# Executar testes
npm test

# Verificar cobertura (meta: 90%+ nas funções de lib/)
npm run test:coverage
```

Os testes cobrem todas as funções matemáticas, validadores, formatadores e componentes base.

---

## Deploy na Vercel

### Opção 1 — Interface web

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **Add New → Project**
3. Importe o repositório do GitHub
4. Framework: **Next.js** (detectado automaticamente)
5. Clique em **Deploy**

### Opção 2 — CLI

```bash
npm install -g vercel
vercel --prod
```

Não são necessárias variáveis de ambiente no MVP.

---

## Armazenamento de dados

Os dados do histórico são salvos no **localStorage do navegador**. Isso significa:

- ✅ Sem necessidade de cadastro ou login
- ✅ Privacidade total — os dados não saem do seu dispositivo
- ⚠️ Os dados não são sincronizados entre dispositivos
- ⚠️ Limpar os dados do navegador apaga o histórico

A arquitetura está preparada para integração futura com Supabase.

---

## Organização do código

```
app/           Páginas (App Router do Next.js)
components/    Componentes React reutilizáveis
lib/math/      Funções matemáticas puras
lib/formatting/ Formatadores de tempo e números
lib/validation/ Validadores de entrada
lib/storage/   Abstração de persistência
types/         Tipos TypeScript compartilhados
hooks/         Hooks personalizados
__tests__/     Testes automatizados
```

---

## Licença

MIT
