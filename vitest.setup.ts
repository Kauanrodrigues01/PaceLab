import '@testing-library/jest-dom/vitest'

// Garante isolamento offline nos testes mesmo quando o `.env` local possui credenciais reais
// (definir string vazia em vez de `delete` evita que `@prisma/client` carregue `.env` via `dotenv`).
process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "";
process.env.GOOGLE_CREDENTIALS_BASE64 = "";

class MockResizeObserver {
  observe = () => {}
  unobserve = () => {}
  disconnect = () => {}
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
