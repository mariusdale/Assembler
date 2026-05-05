import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { SqliteRunStateStore } from '@assembler/core';
import type { ProjectScan, RunPlan } from '@assembler/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createCliApp } from '../src/app.js';

const tempDirectories: string[] = [];

describe('cli app', () => {
  afterEach(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();
      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('stores structured provider credentials in the local state store', async () => {
    const cwd = createTempDirectory();
    const app = createCliApp(cwd);

    await app.addCredential('vercel', [
      'token=vercel_test_token',
      'teamId=team_123',
      'slug=assembler-team',
    ]);

    const store = new SqliteRunStateStore({
      filename: resolve(cwd, '.assembler', 'state.db'),
    });
    store.initialize();

    const record = store.getCredentialRecord('vercel');

    expect(record?.reference).toBe('vercel_test_token');
    expect(record?.metadata).toMatchObject({
      teamId: 'team_123',
      slug: 'assembler-team',
    });
  });

  it('fails execute early when required live provider credentials are missing', async () => {
    const cwd = createTempDirectory();
    const app = createCliApp(cwd);
    const runPlan = createRunPlan();
    const store = new SqliteRunStateStore({
      filename: resolve(cwd, '.assembler', 'state.db'),
    });
    store.initialize();
    store.saveRun(runPlan);

    await expect(app.execute(runPlan.id)).rejects.toThrow(
      'Preflight checks failed:',
    );
  });

  it('passes deployment target preferences into created plans', () => {
    const cwd = createTempDirectory();
    const app = createCliApp(cwd);

    const plan = app.createPlan(createProjectScan(), {
      deploymentTargetPreference: 'vercel',
    });

    expect(plan.tasks.find((task) => task.id === 'vercel-create-project')?.params).toMatchObject({
      framework: 'nextjs',
    });
  });

  it('creates and reads project config files', async () => {
    const cwd = createTempDirectory();
    const app = createCliApp(cwd);
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: 'configured-cli-app',
        scripts: {
          build: 'vite build',
        },
        dependencies: {
          astro: '^5.0.0',
        },
      }),
    );
    writeFileSync(join(cwd, '.env.example'), 'DATABASE_URL=\n');

    const initResult = await app.initConfig();
    const configFile = JSON.parse(readFileSync(initResult.filePath, 'utf8')) as Record<string, unknown>;
    const showResult = await app.showConfig();

    expect(existsSync(join(cwd, 'assembler.config.json'))).toBe(true);
    expect(configFile).toMatchObject({
      framework: 'astro',
      target: 'vercel',
      build: {
        command: 'vite build',
      },
      env: {
        DATABASE_URL: {
          provider: 'neon',
          required: true,
          autoProvision: true,
        },
      },
    });
    expect(showResult.config).toMatchObject({
      framework: 'astro',
      target: 'vercel',
    });
  });
});

function createTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'assembler-cli-'));
  tempDirectories.push(directory);
  return directory;
}

function createRunPlan(): RunPlan {
  return {
    id: 'run_missing_creds',
    projectScan: {
      name: 'menugen',
      framework: 'nextjs',
      directory: '/tmp/menugen',
      hasGitRemote: false,
      detectedProviders: [
        {
          provider: 'github',
          confidence: 'high',
          evidence: ['test'],
        },
        {
          provider: 'vercel',
          confidence: 'high',
          evidence: ['test'],
        },
      ],
      requiredEnvVars: [],
      packageJson: {
        name: 'menugen',
      },
      lockfileCheck: {
        packageManager: 'pnpm',
        lockfileExists: true,
        inSync: true,
        missingFromLockfile: [],
        extraInLockfile: [],
      },
    },
    tasks: [
      {
        id: 'github-create-repo',
        name: 'Create GitHub repository',
        provider: 'github',
        action: 'create-repo',
        params: {},
        dependsOn: [],
        outputs: {},
        status: 'pending',
        risk: 'low',
        requiresApproval: false,
        retryPolicy: {
          maxRetries: 1,
          backoffMs: 500,
        },
        timeoutMs: 30_000,
      },
    ],
    estimatedCostUsd: 0,
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    status: 'approved',
  };
}

function createProjectScan(): ProjectScan {
  return {
    name: 'targeted-app',
    framework: 'nextjs',
    directory: '/tmp/targeted-app',
    hasGitRemote: false,
    detectedProviders: [
      {
        provider: 'vercel',
        confidence: 'high',
        evidence: ['test'],
      },
    ],
    requiredEnvVars: [],
    packageJson: {
      name: 'targeted-app',
    },
    lockfileCheck: {
      packageManager: 'pnpm',
      lockfileExists: true,
      inSync: true,
      missingFromLockfile: [],
      extraInLockfile: [],
    },
  };
}
