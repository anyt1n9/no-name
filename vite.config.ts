import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスで出力し、GitHub Pages などのサブパスでも動くようにする
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
