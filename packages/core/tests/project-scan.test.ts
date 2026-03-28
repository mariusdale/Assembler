import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRunPlanFromProjectScan, scanProject } from '../src/index.js';

describe('project scanner', () => {
  it('detects a Next.js app with DATABASE_URL requirements and no git remote', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'devassemble-scan-'));

    await writeFile(
      join(projectDirectory, 'package.json'),
      JSON.stringify(
        {
          name: 'my-saas-app',
          dependencies: {
            next: '^15.0.0',
            react: '^19.0.0',
            'drizzle-orm': '^0.0.0',
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(projectDirectory, '.env.example'),
      ['DATABASE_URL=', 'DIRECT_DATABASE_URL=', 'STRIPE_SECRET_KEY='].join('\n'),
    );
    await writeFile(join(projectDirectory, 'drizzle.config.ts'), 'export default {};');

    const scan = await scanProject(projectDirectory);

    expect(scan.name).toBe('my-saas-app');
    expect(scan.framework).toBe('nextjs');
    expect(scan.hasGitRemote).toBe(false);
    expect(scan.detectedProviders.some((provider) => provider.provider === 'neon')).toBe(true);
    expect(scan.detectedProviders.some((provider) => provider.provider === 'vercel')).toBe(true);
    expect(scan.requiredEnvVars.map((envVar) => envVar.name)).toContain('DATABASE_URL');
  });
});

describe('scan-driven planner', () => {
  it('builds a BYO-project launch plan with push-code and readiness tasks', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'devassemble-plan-'));
    await mkdir(join(projectDirectory, '.git'), { recursive: true });
    await writeFile(
      join(projectDirectory, 'package.json'),
      JSON.stringify(
        {
          name: 'launchable-app',
          dependencies: {
            next: '^15.0.0',
          },
        },
        null,
        2,
      ),
    );
    await writeFile(join(projectDirectory, '.env.example'), 'DATABASE_URL=\n');

    const runPlan = createRunPlanFromProjectScan({
      name: 'launchable-app',
      framework: 'nextjs',
      directory: projectDirectory,
      hasGitRemote: false,
      detectedProviders: [
        {
          provider: 'neon',
          confidence: 'high',
          evidence: ['.env.example: DATABASE_URL'],
        },
        {
          provider: 'vercel',
          confidence: 'high',
          evidence: ['package.json: dependency next'],
        },
      ],
      requiredEnvVars: [
        {
          name: 'DATABASE_URL',
          provider: 'neon',
          source: '.env.example',
          isAutoProvisionable: true,
        },
      ],
      packageJson: {
        name: 'launchable-app',
      },
    });

    expect(runPlan.projectScan?.name).toBe('launchable-app');
    expect(runPlan.tasks.some((task) => task.id === 'github-push-code')).toBe(true);
    expect(runPlan.tasks.some((task) => task.id === 'vercel-wait-for-ready')).toBe(true);
    expect(runPlan.tasks.some((task) => task.id === 'github-scaffold-template')).toBe(false);
    expect(runPlan.tasks.some((task) => task.id === 'neon-run-schema-migration')).toBe(false);
    expect(runPlan.tasks.some((task) => task.id === 'neon-capture-database-url')).toBe(true);
  });
});
