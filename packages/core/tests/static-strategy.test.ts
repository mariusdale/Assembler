import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRunPlanFromProjectScan, scanProject } from '../src/index.js';

describe('static site strategy', () => {
  it('detects no-build index.html projects and plans a static deploy', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-static-'));
    await writeFile(join(projectDirectory, 'index.html'), '<h1>Hello static</h1>');

    const scan = await scanProject(projectDirectory);
    const plan = createRunPlanFromProjectScan(scan);

    expect(scan.name).toBe(projectDirectory.split('/').at(-1));
    expect(scan.framework).toBe('static');
    expect(plan.tasks.map((task) => task.id)).toContain('vercel-deploy-preview');
    expect(plan.tasks.find((task) => task.id === 'vercel-create-project')?.params).toMatchObject({
      framework: 'static',
      outputDirectory: '.',
    });
  });

  it('detects package-based static build output directories', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-static-build-'));
    await mkdir(join(projectDirectory, 'build'), { recursive: true });
    await writeFile(
      join(projectDirectory, 'package.json'),
      JSON.stringify(
        {
          name: 'docs-site',
          scripts: {
            build: 'vite build --outDir build',
          },
          devDependencies: {
            vite: '^6.0.0',
          },
        },
        null,
        2,
      ),
    );
    await writeFile(join(projectDirectory, 'build', 'index.html'), '<h1>Built docs</h1>');

    const scan = await scanProject(projectDirectory);
    const plan = createRunPlanFromProjectScan(scan);

    expect(scan.name).toBe('docs-site');
    expect(scan.framework).toBe('static');
    expect(plan.tasks.find((task) => task.id === 'vercel-create-project')?.params).toMatchObject({
      buildCommand: 'vite build --outDir build',
      framework: 'static',
      outputDirectory: 'build',
    });
  });

  it('routes static deploy intents to Cloudflare Pages when selected', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-static-cf-'));
    await writeFile(join(projectDirectory, 'index.html'), '<h1>Hello Pages</h1>');

    const scan = await scanProject(projectDirectory);
    const plan = createRunPlanFromProjectScan(scan, {
      deploymentTargetPreference: 'cloudflare-pages',
    });

    expect(plan.tasks.map((task) => task.id)).toContain('cloudflare-pages-trigger-deployment');
    expect(
      plan.tasks.find((task) => task.id === 'cloudflare-pages-create-project')?.params,
    ).toMatchObject({
      artifact: 'static',
      framework: 'static',
      outputDirectory: '.',
    });
    expect(plan.tasks.map((task) => task.id)).not.toContain('vercel-create-project');
  });

  it('uses config target and build overrides when planning static deploys', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-static-config-'));
    await mkdir(join(projectDirectory, 'public'), { recursive: true });
    await writeFile(
      join(projectDirectory, 'package.json'),
      JSON.stringify(
        {
          name: 'configured-static-site',
          scripts: {
            build: 'vite build',
          },
          devDependencies: {
            vite: '^6.0.0',
          },
        },
        null,
        2,
      ),
    );
    await writeFile(join(projectDirectory, 'public', 'index.html'), '<h1>Configured</h1>');
    await writeFile(
      join(projectDirectory, 'assembler.config.json'),
      JSON.stringify(
        {
          framework: 'static',
          target: 'cloudflare-pages',
          build: {
            command: 'pnpm custom-build',
            outputDirectory: 'public',
            nodeVersion: '20.x',
          },
        },
        null,
        2,
      ),
    );

    const scan = await scanProject(projectDirectory);
    const plan = createRunPlanFromProjectScan(scan);

    expect(plan.tasks.map((task) => task.id)).toContain('cloudflare-pages-trigger-deployment');
    expect(
      plan.tasks.find((task) => task.id === 'cloudflare-pages-create-project')?.params,
    ).toMatchObject({
      artifact: 'static',
      framework: 'static',
      buildCommand: 'pnpm custom-build',
      outputDirectory: 'public',
      nodeVersion: '20.x',
    });
  });
});
