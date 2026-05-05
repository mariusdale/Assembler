import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defineConfig, loadProjectConfig, ProjectConfigError } from '../src/index.js';

describe('project config loader', () => {
  it('loads and normalizes JSON config', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-config-'));
    await writeFile(
      join(projectDirectory, 'assembler.config.json'),
      JSON.stringify(
        {
          framework: 'astro',
          target: 'cloudflare-pages',
          build: {
            command: 'pnpm build',
            outputDirectory: 'dist',
            nodeVersion: '20.x',
          },
          env: {
            DATABASE_URL: {
              provider: 'neon',
              required: true,
              autoProvision: true,
            },
          },
          providers: {
            stripe: false,
            neon: {
              enabled: true,
            },
          },
        },
        null,
        2,
      ),
    );

    const loaded = await loadProjectConfig(projectDirectory);

    expect(loaded?.path.endsWith('assembler.config.json')).toBe(true);
    expect(loaded?.config).toEqual({
      framework: 'astro',
      target: 'cloudflare-pages',
      build: {
        command: 'pnpm build',
        outputDirectory: 'dist',
        nodeVersion: '20.x',
      },
      env: {
        DATABASE_URL: {
          provider: 'neon',
          required: true,
          autoProvision: true,
        },
      },
      providers: {
        stripe: false,
        neon: {
          enabled: true,
        },
      },
    });
  });

  it('loads JavaScript config exported as default', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-config-'));
    await writeFile(
      join(projectDirectory, 'assembler.config.mjs'),
      [
        'export default {',
        "  framework: 'static',",
        "  target: 'vercel',",
        "  build: { command: 'npm run build' },",
        '};',
      ].join('\n'),
    );

    const loaded = await loadProjectConfig(projectDirectory);

    expect(loaded?.config).toEqual({
      framework: 'static',
      target: 'vercel',
      build: {
        command: 'npm run build',
      },
    });
  });

  it('loads TypeScript config exported through defineConfig', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-config-'));
    await writeFile(
      join(projectDirectory, 'assembler.config.ts'),
      [
        "import { defineConfig } from '@assembler/core';",
        '',
        'export default defineConfig({',
        "  framework: 'nextjs',",
        "  target: 'vercel',",
        '} as const);',
      ].join('\n'),
    );

    const loaded = await loadProjectConfig(projectDirectory);

    expect(loaded?.config).toEqual({
      framework: 'nextjs',
      target: 'vercel',
    });
  });

  it('returns undefined when no config exists', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-config-'));

    await expect(loadProjectConfig(projectDirectory)).resolves.toBeUndefined();
  });

  it('rejects invalid config values', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-config-'));
    await writeFile(
      join(projectDirectory, 'assembler.config.json'),
      JSON.stringify({
        framework: 'rails',
        env: {
          'not valid': {},
        },
      }),
    );

    await expect(loadProjectConfig(projectDirectory)).rejects.toThrow(ProjectConfigError);
  });

  it('returns typed config unchanged from defineConfig', () => {
    expect(defineConfig({ framework: 'nextjs' })).toEqual({ framework: 'nextjs' });
  });
});
