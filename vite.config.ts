import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  build:
    mode === 'lib'
      ? {
          lib: { entry: 'src/index.ts', name: 'Mailcraft', fileName: 'mailcraft', formats: ['es', 'umd'] },
          emptyOutDir: true,
        }
      : { outDir: 'dist-demo' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
}));
