import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Your backend server port
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, '') // Only if backend routes don't start with /api
      }
    }
  }
})