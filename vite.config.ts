import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'path'
import obfuscator from 'vite-plugin-javascript-obfuscator'

const obfuscatorConfig: any = {
  include: [resolve(__dirname, 'src/**/*'), resolve(__dirname, 'electron/**/*')],
  exclude: [/node_modules/],
  apply: 'build',
  debugger: true,
  options: {
    compact: true,
    controlFlowFlattening: false, // Отключаем для ускорения и стабильности сборки, оставляем только основные защиты
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
  }
}

export default defineConfig({
  plugins: [
    react(),
    obfuscator(obfuscatorConfig) as any,
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          plugins: [obfuscator(obfuscatorConfig) as any],
          build: {
            outDir: 'dist-electron',
            minify: true,
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          plugins: [obfuscator(obfuscatorConfig) as any],
          build: {
            outDir: 'dist-electron',
            minify: true,
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/release/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/.git/**'
      ]
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})