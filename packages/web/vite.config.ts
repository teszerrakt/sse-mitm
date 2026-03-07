import path from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const commitHash = execSync('git rev-parse --short=7 HEAD').toString().trim()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  server: {
    proxy: {
      '/relay': 'http://localhost:29000',
      '/sessions': 'http://localhost:29000',
      '/replay': 'http://localhost:29000',
      '/config': 'http://localhost:29000',
      '/ws': {
        target: 'ws://localhost:29000',
        ws: true,
      },
    },
  },
})
