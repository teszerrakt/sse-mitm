import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
