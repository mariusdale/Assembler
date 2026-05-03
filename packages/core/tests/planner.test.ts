import type { ProjectScan } from '@assembler/types';
import { describe, expect, it } from 'vitest';

import {
  createRunPlanFromProjectScan,
  DependencyGraphError,
  topologicallySortTasks,
} from '../src/index.js';

const sampleProjectScan = {
  name: 'menugen',
  framework: 'nextjs',
  directory: '/tmp/menugen',
  hasGitRemote: false,
  detectedProviders: [
    {
      provider: 'vercel',
      confidence: 'high',
      evidence: ['package.json: dependency next'],
    },
    {
      provider: 'neon',
      confidence: 'high',
      evidence: ['.env.example: DATABASE_URL'],
    },
    {
      provider: 'stripe',
      confidence: 'medium',
      evidence: ['package.json: dependency stripe'],
    },
    {
      provider: 'clerk',
      confidence: 'medium',
      evidence: ['package.json: dependency @clerk/nextjs'],
    },
    {
      provider: 'sentry',
      confidence: 'medium',
      evidence: ['package.json: dependency @sentry/nextjs'],
    },
    {
      provider: 'resend',
      confidence: 'medium',
      evidence: ['package.json: dependency resend'],
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
    name: 'menugen',
  },
  lockfileCheck: {
    packageManager: 'pnpm',
    lockfileExists: true,
    inSync: true,
    missingFromLockfile: [],
    extraInLockfile: [],
  },
} satisfies ProjectScan;

describe('scan-driven planner', () => {
  it('keeps the Next.js plan stable through the default framework strategy', () => {
    const runPlan = createRunPlanFromProjectScan(sampleProjectScan, {
      now: new Date('2026-03-27T00:00:00.000Z'),
      idGenerator: () => 'run_test',
    });

    expect(
      runPlan.tasks.map((task) => ({
        id: task.id,
        provider: task.provider,
        action: task.action,
        params: task.params,
        dependsOn: task.dependsOn,
        risk: task.risk,
        requiresApproval: task.requiresApproval,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "action": "create-repo",
          "dependsOn": [],
          "id": "github-create-repo",
          "params": {
            "description": "Deploy menugen",
            "name": "menugen",
            "private": true,
          },
          "provider": "github",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "push-code",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "github-push-code",
          "params": {
            "directory": "/tmp/menugen",
          },
          "provider": "github",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "create-project",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "neon-create-project",
          "params": {
            "databaseName": "menugen",
            "name": "menugen-db",
          },
          "provider": "neon",
          "requiresApproval": true,
          "risk": "medium",
        },
        {
          "action": "create-database",
          "dependsOn": [
            "neon-create-project",
          ],
          "id": "neon-create-database",
          "params": {
            "databaseName": "menugen",
          },
          "provider": "neon",
          "requiresApproval": true,
          "risk": "medium",
        },
        {
          "action": "capture-database-url",
          "dependsOn": [
            "neon-create-database",
          ],
          "id": "neon-capture-database-url",
          "params": {},
          "provider": "neon",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "capture-keys",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "stripe-capture-keys",
          "params": {},
          "provider": "stripe",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "capture-keys",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "clerk-capture-keys",
          "params": {},
          "provider": "clerk",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "capture-dsn",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "sentry-capture-dsn",
          "params": {},
          "provider": "sentry",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "capture-api-key",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "resend-capture-api-key",
          "params": {},
          "provider": "resend",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "create-project",
          "dependsOn": [
            "github-create-repo",
          ],
          "id": "vercel-create-project",
          "params": {
            "framework": "nextjs",
            "name": "menugen",
          },
          "provider": "vercel",
          "requiresApproval": true,
          "risk": "medium",
        },
        {
          "action": "link-repository",
          "dependsOn": [
            "vercel-create-project",
            "github-push-code",
          ],
          "id": "vercel-link-repository",
          "params": {
            "framework": "nextjs",
            "name": "menugen",
          },
          "provider": "vercel",
          "requiresApproval": true,
          "risk": "medium",
        },
        {
          "action": "sync-predeploy-env-vars",
          "dependsOn": [
            "vercel-link-repository",
            "github-push-code",
            "neon-capture-database-url",
            "stripe-capture-keys",
            "clerk-capture-keys",
            "sentry-capture-dsn",
            "resend-capture-api-key",
          ],
          "id": "vercel-sync-predeploy-env-vars",
          "params": {},
          "provider": "vercel",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "deploy-preview",
          "dependsOn": [
            "vercel-sync-predeploy-env-vars",
          ],
          "id": "vercel-deploy-preview",
          "params": {},
          "provider": "vercel",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "wait-for-ready",
          "dependsOn": [
            "vercel-deploy-preview",
          ],
          "id": "vercel-wait-for-ready",
          "params": {},
          "provider": "vercel",
          "requiresApproval": false,
          "risk": "low",
        },
        {
          "action": "health-check",
          "dependsOn": [
            "vercel-wait-for-ready",
          ],
          "id": "vercel-health-check",
          "params": {},
          "provider": "vercel",
          "requiresApproval": false,
          "risk": "low",
        },
      ]
    `);
  });

  it('generates a draft RunPlan in dependency order', () => {
    const runPlan = createRunPlanFromProjectScan(sampleProjectScan, {
      now: new Date('2026-03-27T00:00:00.000Z'),
      idGenerator: () => 'run_test',
    });

    expect(runPlan.id).toBe('run_test');
    expect(runPlan.status).toBe('draft');
    expect(runPlan.projectScan?.name).toBe('menugen');
    expect(runPlan.tasks.length).toBeGreaterThanOrEqual(13);

    const indexByTaskId = new Map(runPlan.tasks.map((task, index) => [task.id, index]));
    for (const task of runPlan.tasks) {
      for (const dependencyId of task.dependsOn) {
        expect(indexByTaskId.get(dependencyId)).toBeLessThan(indexByTaskId.get(task.id) ?? 0);
      }
    }

    expect(runPlan.tasks.find((task) => task.id === 'neon-create-project')?.requiresApproval).toBe(
      true,
    );
    expect(
      runPlan.tasks.find((task) => task.id === 'vercel-create-project')?.requiresApproval,
    ).toBe(true);
    expect(runPlan.tasks.find((task) => task.id === 'github-create-repo')?.params).toMatchObject({
      name: 'menugen',
      description: 'Deploy menugen',
      private: true,
    });
    expect(runPlan.tasks.find((task) => task.id === 'github-push-code')?.params).toMatchObject({
      directory: '/tmp/menugen',
    });
    expect(runPlan.tasks.some((task) => task.id === 'github-scaffold-template')).toBe(false);
  });

  it('reuses the existing GitHub repository only when requested', () => {
    const projectScan = {
      ...sampleProjectScan,
      hasGitRemote: true,
      gitRemoteUrl: 'git@github.com:mariusdale/menugen.git',
    } satisfies ProjectScan;

    const defaultPlan = createRunPlanFromProjectScan(projectScan);
    const reusePlan = createRunPlanFromProjectScan(projectScan, { useExistingRepo: true });

    expect(defaultPlan.tasks.some((task) => task.id === 'github-create-repo')).toBe(true);
    expect(defaultPlan.tasks.some((task) => task.id === 'github-use-existing-repo')).toBe(false);
    expect(reusePlan.tasks.some((task) => task.id === 'github-create-repo')).toBe(false);
    expect(reusePlan.tasks.find((task) => task.id === 'github-use-existing-repo')?.params).toEqual({
      remoteUrl: 'git@github.com:mariusdale/menugen.git',
    });
  });

  it('detects cycles in a manually corrupted DAG', () => {
    const runPlan = createRunPlanFromProjectScan(sampleProjectScan);
    const mutatedTasks = runPlan.tasks.map((task) =>
      task.id === 'github-create-repo'
        ? {
            ...task,
            dependsOn: ['vercel-deploy-preview'],
          }
        : task,
    );

    expect(() => topologicallySortTasks(mutatedTasks)).toThrow(DependencyGraphError);
  });
});
