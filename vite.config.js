import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /**
     * `npm run dev` has no Vercel serverless /api. Proxy to production so
     * http://localhost:5173/r/{id} can load real share data while editing UI.
     */
    proxy: {
      '/api': {
        target: 'https://metro-multiverse.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
