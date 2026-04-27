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
