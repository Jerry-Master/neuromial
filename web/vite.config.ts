import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site at /neuromial/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/neuromial/' : '/',
})
