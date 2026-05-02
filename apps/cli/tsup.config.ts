import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  // Workspace packages are bundled inline
  noExternal: [
    '@assembler/core',
    '@assembler/providers',
    '@assembler/types',
  ],
  // Native addons and heavy deps stay external
  external: [
    'better-sqlite3',
    'react',
    'react-dom',
    'ink',
    'ink-select-input',
    'ink-spinner',
    'ink-text-input',
    'yoga-wasm-web',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'react';
  },
});
