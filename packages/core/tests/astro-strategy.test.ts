import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createDeploymentTargetRegistry,
  createRunPlanFromProjectScan,
  scanProject,
} from '../src/index.js';

describe('Astro framework strategy', () => {
  it('plans static Astro projects through the default Vercel target', async () => {
    const projectDirectory = await createAstroProject({
      config: "import { defineConfig } from 'astro/config';\nexport default defineConfig({});",
    });

    const scan = await scanProject(projectDirectory);
    const plan = createRunPlanFromProjectScan(scan);

    expect(scan.framework).toBe('astro');
    expect(plan.tasks.map((task) => task.id)).toContain('vercel-deploy-preview');
    expect(plan.tasks.find((task) => task.id === 'vercel-create-project')?.params).toMatchObject({
      buildCommand: 'astro build',
      framework: 'astro',
      name: 'sample-astro-app',
      outputDirectory: 'dist',
    });
  });

  it('plans server-rendered Astro projects as SSR deploy intents', async () => {
    const projectDirectory = await createAstroProject({
      config:
        "import { defineConfig } from 'astro/config';\nexport default defineConfig({ output: 'server' });",
    });

    const scan = await scanProject(projectDirectory);
    const deploymentTargetRegistry = createDeploymentTargetRegistry([
      {
        name: 'capture-target',
        providerName: 'capture',
        supports: () => true,
        plan: (intent, ctx) => [
          {
            id: 'capture-deploy',
            name: 'Capture deploy intent',
            provider: 'capture',
            action: 'deploy',
            params: { artifact: intent.artifact, framework: intent.framework },
            dependsOn: [ctx.repoTaskId],
          },
        ],
      },
    ]);
    const plan = createRunPlanFromProjectScan(scan, { deploymentTargetRegistry });

    expect(plan.tasks.find((task) => task.id === 'capture-deploy')?.params).toMatchObject({
      artifact: 'ssr-node',
      framework: 'astro',
    });
  });

  it('detects framework-neutral Clerk packages and common Stripe webhook paths', async () => {
    const projectDirectory = await createAstroProject({
      dependencies: {
        '@clerk/astro': '^0.10.0',
        astro: '^5.0.0',
        stripe: '^17.0.0',
      },
    });
    await mkdir(join(projectDirectory, 'src', 'pages', 'api', 'webhooks'), { recursive: true });
    await writeFile(join(projectDirectory, 'src', 'pages', 'api', 'webhooks', 'stripe.ts'), '');

    const scan = await scanProject(projectDirectory);

    expect(scan.detectedProviders.find((provider) => provider.provider === 'clerk')).toMatchObject({
      confidence: 'medium',
      evidence: ['package.json: dependency @clerk/astro'],
    });
    expect(scan.detectedProviders.find((provider) => provider.provider === 'stripe')).toMatchObject({
      confidence: 'high',
      evidence: expect.arrayContaining(['src/pages/api/webhooks/stripe.ts']),
    });
  });
});

async function createAstroProject(options: {
  config?: string;
  dependencies?: Record<string, string>;
} = {}): Promise<string> {
  const projectDirectory = await mkdtemp(join(tmpdir(), 'assembler-astro-'));
  await writeFile(
    join(projectDirectory, 'package.json'),
    JSON.stringify(
      {
        name: 'sample-astro-app',
        scripts: {
          build: 'astro build',
        },
        dependencies: options.dependencies ?? {
          '@neondatabase/serverless': '^0.10.0',
          astro: '^5.0.0',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(join(projectDirectory, 'astro.config.mjs'), options.config ?? '');
  await writeFile(join(projectDirectory, '.env.example'), 'DATABASE_URL=\n');

  return projectDirectory;
}
