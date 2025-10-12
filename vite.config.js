import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import purgeCss from 'vite-plugin-purgecss'

export default defineConfig({
  plugins: [
    react(),
    purgeCss({
      content: ['./src/**/*.jsx', './index.html'],
    }),
  ],
  root: '.',
  base: './'
})
