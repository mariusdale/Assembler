import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { LockfileCheck } from '@devassemble/types';

import { createRunPlanFromProjectScan, scanProject } from '../src/index.js';

const LOCKFILE_CHECK_PLACEHOLDER: LockfileCheck = {
  packageManager: undefined,
  lockfileExists: false,
  inSync: false,
  missingFromLockfile: [],
  extraInLockfile: [],
};

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

describe('lockfile check', () => {
  async function createProjectWithPackageJson(
    dir: string,
    deps: Record<string, string>,
    devDeps?: Record<string, string>,
  ): Promise<void> {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        dependencies: deps,
        ...(devDeps ? { devDependencies: devDeps } : {}),
      }, null, 2),
    );
  }

  it('reports no lockfile when none exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { next: '^15.0.0' });

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.lockfileExists).toBe(false);
    expect(scan.lockfileCheck.inSync).toBe(false);
    expect(scan.lockfileCheck.packageManager).toBeUndefined();
  });

  it('reports in sync for matching npm lockfile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { react: '^18.0.0' }, { typescript: '^5.0.0' });
    await writeFile(
      join(dir, 'package-lock.json'),
      JSON.stringify({
        name: 'test-app',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: { react: '^18.0.0' },
            devDependencies: { typescript: '^5.0.0' },
          },
        },
      }, null, 2),
    );

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.packageManager).toBe('npm');
    expect(scan.lockfileCheck.lockfileExists).toBe(true);
    expect(scan.lockfileCheck.inSync).toBe(true);
    expect(scan.lockfileCheck.missingFromLockfile).toEqual([]);
    expect(scan.lockfileCheck.extraInLockfile).toEqual([]);
  });

  it('detects missing dependencies in npm lockfile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { react: '^18.0.0', next: '^15.0.0' });
    await writeFile(
      join(dir, 'package-lock.json'),
      JSON.stringify({
        name: 'test-app',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: { react: '^18.0.0' },
          },
        },
      }, null, 2),
    );

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.inSync).toBe(false);
    expect(scan.lockfileCheck.missingFromLockfile).toContain('next');
  });

  it('detects extra dependencies in npm lockfile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { react: '^18.0.0' });
    await writeFile(
      join(dir, 'package-lock.json'),
      JSON.stringify({
        name: 'test-app',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: { react: '^18.0.0', leftover: '^1.0.0' },
          },
        },
      }, null, 2),
    );

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.inSync).toBe(false);
    expect(scan.lockfileCheck.extraInLockfile).toContain('leftover');
  });

  it('reports in sync for matching pnpm lockfile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { next: '^15.0.0' }, { typescript: '^5.0.0' });
    await writeFile(
      join(dir, 'pnpm-lock.yaml'),
      [
        'lockfileVersion: \'9.0\'',
        'importers:',
        '  .:',
        '    dependencies:',
        '      next:',
        '        specifier: ^15.0.0',
        '        version: 15.0.0',
        '    devDependencies:',
        '      typescript:',
        '        specifier: ^5.0.0',
        '        version: 5.0.0',
        'packages:',
        '  next@15.0.0:',
        '    resolution: {integrity: sha512-abc}',
      ].join('\n'),
    );

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.packageManager).toBe('pnpm');
    expect(scan.lockfileCheck.lockfileExists).toBe(true);
    expect(scan.lockfileCheck.inSync).toBe(true);
  });

  it('detects missing dependencies in pnpm lockfile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { next: '^15.0.0', react: '^18.0.0' });
    await writeFile(
      join(dir, 'pnpm-lock.yaml'),
      [
        'lockfileVersion: \'9.0\'',
        'importers:',
        '  .:',
        '    dependencies:',
        '      next:',
        '        specifier: ^15.0.0',
        '        version: 15.0.0',
        'packages:',
        '  next@15.0.0:',
        '    resolution: {integrity: sha512-abc}',
      ].join('\n'),
    );

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.inSync).toBe(false);
    expect(scan.lockfileCheck.missingFromLockfile).toContain('react');
  });

  it('reports in sync for matching yarn lockfile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devassemble-lock-'));
    await createProjectWithPackageJson(dir, { react: '^18.0.0' });
    await writeFile(
      join(dir, 'yarn.lock'),
      [
        '# yarn lockfile v1',
        '',
        'react@^18.0.0:',
        '  version "18.3.0"',
        '  resolved "https://registry.yarnpkg.com/react/-/react-18.3.0.tgz"',
        '  integrity sha512-abc',
      ].join('\n'),
    );

    const scan = await scanProject(dir);
    expect(scan.lockfileCheck.packageManager).toBe('yarn');
    expect(scan.lockfileCheck.lockfileExists).toBe(true);
    expect(scan.lockfileCheck.inSync).toBe(true);
  });

  it('finds pnpm lockfile at monorepo root and matches sub-package importer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devassemble-mono-'));
    const subDir = join(root, 'apps', 'my-app');
    await mkdir(subDir, { recursive: true });
    await createProjectWithPackageJson(subDir, { next: '^15.0.0', react: '^18.0.0' });
    // Lockfile lives at the monorepo root, not in the sub-package
    await writeFile(
      join(root, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      turbo:',
        '        specifier: ^2.0.0',
        '        version: 2.0.0',
        '  apps/my-app:',
        '    dependencies:',
        '      next:',
        '        specifier: ^15.0.0',
        '        version: 15.0.0',
        '      react:',
        '        specifier: ^18.0.0',
        '        version: 18.3.0',
        'packages:',
        '  next@15.0.0:',
        '    resolution: {integrity: sha512-abc}',
      ].join('\n'),
    );

    const scan = await scanProject(subDir);
    expect(scan.lockfileCheck.packageManager).toBe('pnpm');
    expect(scan.lockfileCheck.lockfileExists).toBe(true);
    expect(scan.lockfileCheck.inSync).toBe(true);
    expect(scan.lockfileCheck.missingFromLockfile).toEqual([]);
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
      lockfileCheck: LOCKFILE_CHECK_PLACEHOLDER,
    });

    expect(runPlan.projectScan?.name).toBe('launchable-app');
    expect(runPlan.tasks.some((task) => task.id === 'github-push-code')).toBe(true);
    expect(runPlan.tasks.some((task) => task.id === 'vercel-wait-for-ready')).toBe(true);
    expect(runPlan.tasks.some((task) => task.id === 'github-scaffold-template')).toBe(false);
    expect(runPlan.tasks.some((task) => task.id === 'neon-run-schema-migration')).toBe(false);
    expect(runPlan.tasks.some((task) => task.id === 'neon-capture-database-url')).toBe(true);
  });
});
