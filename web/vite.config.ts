import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the custom domain root (neuromial.com) on GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/',
})
