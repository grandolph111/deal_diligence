import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Mock environment variables for tests
    'import.meta.env.VITE_AUTH0_DOMAIN': JSON.stringify('test.auth0.com'),
    'import.meta.env.VITE_AUTH0_CLIENT_ID': JSON.stringify('test-client-id'),
    'import.meta.env.VITE_AUTH0_AUDIENCE': JSON.stringify('https://api.test.com'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://localhost:3001/api/v1'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})
