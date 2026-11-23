import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sistema CCB — Gestão das Casas de Oração',
        short_name: 'Sistema CCB',
        description: 'Manutenção, obras e materiais de limpeza das Casas de Oração.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f6f5',
        theme_color: '#043dac',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512-mascara.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só a "casca" do app fica em cache. Dados da API NUNCA vêm do cache:
        // aprovações e estoque precisam sempre da resposta atual do servidor.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8099' },
  },
})
