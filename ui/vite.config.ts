import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/relay': 'http://localhost:9000',
      '/sessions': 'http://localhost:9000',
      '/replay': 'http://localhost:9000',
      '/ws': {
        target: 'ws://localhost:9000',
        ws: true,
      },
    },
  },
})
