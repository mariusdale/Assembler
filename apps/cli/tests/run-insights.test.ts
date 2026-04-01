import { describe, expect, it } from 'vitest';
import type { ProjectScan, RunEvent, RunPlan, Task } from '@devassemble/types';

import {
  deriveExecutionView,
  deriveRunOutcomeSummary,
  getLaunchReadiness,
  groupTasksForPlan,
} from '../src/tui/run-insights.js';
import type { PreflightCheckResults } from '../src/app.js';

describe('run insights', () => {
  it('marks launch as blocked when preflight results are invalid', () => {
    const projectScan = createProjectScan();
    const results: PreflightCheckResults = {
      allValid: false,
      results: new Map([
        [
          'github',
          {
            valid: false,
            errors: [
              {
                code: 'GITHUB_TOKEN_MISSING',
                message: 'No GitHub token configured.',
                remediation: 'Add a GitHub token.',
              },
            ],
          },
        ],
      ]),
    };

    expect(getLaunchReadiness(projectScan, results)).toBe('blocked');
  });

  it('groups plan tasks into repo, infra, config, deploy, and verify phases', () => {
    const groups = groupTasksForPlan(createRunPlan().tasks);

    expect(groups.map((group) => group.key)).toEqual([
      'repo',
      'infra',
      'config',
      'deploy',
      'verify',
    ]);
  });

  it('derives retrying state and current task from run events', () => {
    const runPlan = createRunPlan();
    const events = [
      createEvent('evt-1', 'github-create-repo', 'task.status_changed', 'Task github-create-repo started.', {
        status: 'running',
      }),
      createEvent('evt-2', 'github-create-repo', 'task.status_changed', 'Task github-create-repo completed successfully.', {
        status: 'success',
      }),
      createEvent('evt-3', 'vercel-deploy-preview', 'task.status_changed', 'Task vercel-deploy-preview started.', {
        status: 'running',
      }),
      createEvent('evt-4', 'vercel-deploy-preview', 'task.log', 'Task vercel-deploy-preview failed attempt 1, retrying.', {
        attemptNumber: 1,
      }, 'warn'),
    ];

    const view = deriveExecutionView(runPlan, events, new Date('2026-04-01T12:00:15Z'));
    const deployGroup = view.taskGroups.find((group) => group.key === 'deploying');
    const deployTask = deployGroup?.tasks.find((task) => task.id === 'vercel-deploy-preview');

    expect(view.currentTaskLabel).toBe('Deploy to Vercel preview');
    expect(deployTask?.status).toBe('retrying');
    expect(deployTask?.attemptCount).toBe(1);
  });

  it('summarizes successful runs with warnings from health checks', () => {
    const runPlan = createRunPlan({
      healthOutputs: {
        healthy: false,
        error: 'HTTP 401',
      },
    });

    const summary = deriveRunOutcomeSummary(runPlan);

    expect(summary.kind).toBe('success_with_warnings');
    expect(summary.previewUrl).toBe('https://preview.devassemble.test');
    expect(summary.repoUrl).toBe('https://github.com/devassemble/sample-app');
    expect(summary.warnings[0]).toContain('HTTP 401');
  });
});

function createProjectScan(): ProjectScan {
  return {
    name: 'sample-app',
    framework: 'nextjs',
    directory: '/tmp/sample-app',
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
    requiredEnvVars: [],
    packageJson: {
      name: 'sample-app',
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

function createRunPlan(options?: {
  healthOutputs?: Record<string, unknown>;
}): RunPlan {
  return {
    id: 'run_12345678',
    createdAt: new Date('2026-04-01T12:00:00Z'),
    estimatedCostUsd: 0,
    status: 'completed',
    tasks: [
      createTask('github-create-repo', 'Create GitHub repository', 'github', 'create-repo', 'success', {
        repoUrl: 'https://github.com/devassemble/sample-app',
        repoFullName: 'devassemble/sample-app',
      }),
      createTask('neon-create-project', 'Create Neon project', 'neon', 'create-project', 'success', {
        projectName: 'sample-app-db',
      }),
      createTask('vercel-create-project', 'Create Vercel project', 'vercel', 'create-project', 'success', {
        projectName: 'sample-app',
      }),
      createTask('vercel-sync-predeploy-env-vars', 'Sync environment variables to Vercel', 'vercel', 'sync-predeploy-env-vars', 'success', {
        syncedKeys: ['DATABASE_URL'],
      }),
      createTask('vercel-deploy-preview', 'Deploy to Vercel preview', 'vercel', 'deploy-preview', 'running', {
        deploymentId: 'dpl_1234567890',
        previewUrl: 'https://preview.devassemble.test',
      }),
      createTask('vercel-wait-for-ready', 'Wait for Vercel deployment readiness', 'vercel', 'wait-for-ready', 'success', {
        previewUrl: 'https://preview.devassemble.test',
      }),
      createTask('vercel-health-check', 'Verify deployment health', 'vercel', 'health-check', 'success', options?.healthOutputs ?? {
        healthy: true,
      }),
    ],
  };
}

function createTask(
  id: string,
  name: string,
  provider: string,
  action: string,
  status: Task['status'],
  outputs: Record<string, unknown>,
): Task {
  return {
    id,
    name,
    provider,
    action,
    params: {},
    dependsOn: [],
    outputs,
    status,
    risk: 'low',
    requiresApproval: false,
    retryPolicy: {
      maxRetries: 1,
      backoffMs: 500,
    },
    timeoutMs: 30_000,
  };
}

function createEvent(
  id: string,
  taskId: string,
  type: RunEvent['type'],
  message: string,
  metadata?: Record<string, unknown>,
  level: RunEvent['level'] = 'info',
): RunEvent {
  return {
    id,
    runId: 'run_12345678',
    taskId,
    type,
    level,
    message,
    timestamp: new Date('2026-04-01T12:00:05Z'),
    ...(metadata ? { metadata } : {}),
  };
}
