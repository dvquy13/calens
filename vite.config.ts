import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { manifestPlugin } from './scripts/manifest-plugin';

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        homepage: resolve(__dirname, 'homepage.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        'content/date-detector': resolve(__dirname, 'src/content/date-detector.ts'),
        'content/event-enhancer': resolve(__dirname, 'src/content/event-enhancer.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        // Disable code splitting to bundle each entry point completely
        manualChunks: undefined,
      },
    },
    // Prevent code splitting - each entry gets its dependencies inlined
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/lib/db/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
