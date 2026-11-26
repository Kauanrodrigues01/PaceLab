import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    env: {
      GOOGLE_SHEETS_SPREADSHEET_ID: '',
      GOOGLE_CREDENTIALS_BASE64: '',
    },
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/storage/**', 'lib/prisma.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
