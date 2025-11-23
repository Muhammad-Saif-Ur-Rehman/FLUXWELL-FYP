import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.fbx', '**/*.glb', '**/*.gltf'],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/register': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/login': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/me': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/onboarding': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/connect-health-service': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/google': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/google/callback': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/fitbit': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/fitbit/callback': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/test': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/movement': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      }
    }
  }
})
