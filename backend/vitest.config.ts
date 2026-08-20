import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const backendRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'ali-oss': path.join(backendRoot, 'node_modules', 'ali-oss'),
    },
  },
  test: {
    environment: 'node',
    include: ['../tests/backend/**/*.test.ts'],
  },
})
