import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import purgeCss from 'vite-plugin-purgecss'

export default defineConfig({
  plugins: [
    react(),
    purgeCss({
      content: ['./index.html', './src/**/*.{js,jsx}'],
      safelist: [
        'app-shell--radar',
        'app-main--radar',
        'app-header__refresh--hidden',
        'active',
        'is-selected'
      ]
    })
  ],
  root: '.',
  base: './'
})
