import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  Credentials,
  ExecutionContext,
  ProjectScan,
  ProviderPack,
  Task,
  TaskResult,
} from '@assembler/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createExecutor, createRunPlanFromProjectScan, SqliteRunStateStore } from '../src/index.js';

/**
 * A ProjectScan that matches the test fixture: Next.js + Neon (DATABASE_URL),
 * no existing git remote.
 */
function createFixtureScan(directory: string): ProjectScan {
  return {
    name: 'sample-nextjs-app',
    framework: 'nextjs',
    directory,
    hasGitRemote: false,
    detectedProviders: [
      {
        provider: 'neon',
        confidence: 'high',
        evidence: ['.env.example: DATABASE_URL', 'package.json: dependency @neondatabase/serverless', 'drizzle.config.ts'],
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
      name: 'sample-nextjs-app',
      dependencies: {
        next: '14.2.0',
        react: '18.3.0',
        'react-dom': '18.3.0',
        '@neondatabase/serverless': '0.9.0',
        'drizzle-orm': '0.30.0',
      },
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

const EXPECTED_TASK_IDS = [
  'github-create-repo',
  'github-push-code',
  'neon-create-project',
  'neon-create-database',
  'neon-capture-database-url',
  'vercel-create-project',
  'vercel-link-repository',
  'vercel-sync-predeploy-env-vars',
  'vercel-deploy-preview',
  'vercel-wait-for-ready',
  'vercel-health-check',
];

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function createStore(): SqliteRunStateStore {
  const dir = mkdtempSync(join(tmpdir(), 'assembler-launch-int-'));
  tempDirs.push(dir);
  return new SqliteRunStateStore({ filename: join(dir, 'state.db') });
}

describe('launch flow integration', () => {
  it('produces the correct task DAG for Next.js + Neon (no git remote)', () => {
    const scan = createFixtureScan('/tmp/fake-project');
    const plan = createRunPlanFromProjectScan(scan);

    expect(plan.tasks.map((t) => t.id)).toEqual(EXPECTED_TASK_IDS);
    expect(plan.status).toBe('draft');
    expect(plan.projectScan?.name).toBe('sample-nextjs-app');
  });

  it('has correct dependency edges for every task', () => {
    const scan = createFixtureScan('/tmp/fake-project');
    const plan = createRunPlanFromProjectScan(scan);
    const deps = Object.fromEntries(plan.tasks.map((t) => [t.id, t.dependsOn]));

    expect(deps['github-create-repo']).toEqual([]);
    expect(deps['github-push-code']).toEqual(['github-create-repo']);
    expect(deps['neon-create-project']).toEqual(['github-create-repo']);
    expect(deps['neon-create-database']).toEqual(['neon-create-project']);
    expect(deps['neon-capture-database-url']).toEqual(['neon-create-database']);
    expect(deps['vercel-create-project']).toEqual(['github-create-repo']);
    expect(deps['vercel-link-repository']).toEqual(['vercel-create-project', 'github-push-code']);
    expect(deps['vercel-sync-predeploy-env-vars']).toEqual(
      expect.arrayContaining([
        'vercel-link-repository',
        'github-push-code',
        'neon-capture-database-url',
      ]),
    );
    expect(deps['vercel-deploy-preview']).toEqual(['vercel-sync-predeploy-env-vars']);
    expect(deps['vercel-wait-for-ready']).toEqual(['vercel-deploy-preview']);
    expect(deps['vercel-health-check']).toEqual(['vercel-wait-for-ready']);
  });

  it('includes Stripe and Clerk tasks when those providers are detected', () => {
    const scan = createFixtureScan('/tmp/fake-project');
    scan.detectedProviders.push(
      { provider: 'stripe', confidence: 'high', evidence: ['package.json: dependency stripe'] },
      { provider: 'clerk', confidence: 'high', evidence: ['package.json: dependency @clerk/nextjs'] },
    );
    scan.requiredEnvVars.push(
      { name: 'STRIPE_SECRET_KEY', provider: 'stripe', source: '.env.example', isAutoProvisionable: true },
      { name: 'CLERK_SECRET_KEY', provider: 'clerk', source: '.env.example', isAutoProvisionable: true },
    );

    const plan = createRunPlanFromProjectScan(scan);
    const taskIds = plan.tasks.map((t) => t.id);

    expect(taskIds).toContain('stripe-capture-keys');
    expect(taskIds).toContain('clerk-capture-keys');

    // Predeploy env sync must depend on both capture tasks
    const syncTask = plan.tasks.find((t) => t.id === 'vercel-sync-predeploy-env-vars')!;
    expect(syncTask.dependsOn).toContain('stripe-capture-keys');
    expect(syncTask.dependsOn).toContain('clerk-capture-keys');
  });

  it('uses existing repo task when git remote is present', () => {
    const scan = createFixtureScan('/tmp/fake-project');
    scan.hasGitRemote = true;
    scan.gitRemoteUrl = 'https://github.com/testuser/sample-nextjs-app.git';

    const plan = createRunPlanFromProjectScan(scan);
    const taskIds = plan.tasks.map((t) => t.id);

    expect(taskIds).toContain('github-use-existing-repo');
    expect(taskIds).not.toContain('github-create-repo');

    // push-code should depend on the existing repo task
    const pushTask = plan.tasks.find((t) => t.id === 'github-push-code')!;
    expect(pushTask.dependsOn).toEqual(['github-use-existing-repo']);
  });

  it('executes the full DAG with mock providers that validate output wiring', async () => {
    const appliedTasks: string[] = [];
    const outputLog = new Map<string, Record<string, unknown>>();

    // Mock outputs that each provider action produces (matching real provider output keys)
    const mockOutputs: Record<string, Record<string, unknown>> = {
      'github-create-repo': {
        repoId: 12345,
        repoName: 'sample-nextjs-app',
        repoFullName: 'testuser/sample-nextjs-app',
        repoUrl: 'https://github.com/testuser/sample-nextjs-app',
        owner: 'testuser',
        ownerId: 99,
        defaultBranch: 'main',
      },
      'github-push-code': {
        branch: 'main',
        fileCount: 7,
        latestCommitSha: 'abc123def456',
      },
      'neon-create-project': {
        projectId: 'neon-proj-001',
        projectName: 'sample-nextjs-app-db',
        branchId: 'br-main-001',
        databaseUrl: 'postgresql://user:pass@ep-cool-smoke-123.us-east-2.aws.neon.tech/sample-nextjs-app',
      },
      'neon-create-database': {
        databaseName: 'sample-nextjs-app',
        projectId: 'neon-proj-001',
        branchId: 'br-main-001',
        ownerName: 'neondb_owner',
      },
      'neon-capture-database-url': {
        databaseUrl: 'postgresql://user:pass@ep-cool-smoke-123.us-east-2.aws.neon.tech/sample-nextjs-app',
      },
      'vercel-create-project': {
        projectId: 'prj_vercel_001',
        projectName: 'sample-nextjs-app',
      },
      'vercel-link-repository': {
        projectId: 'prj_vercel_001',
        projectName: 'sample-nextjs-app',
        linkedRepo: 'testuser/sample-nextjs-app',
        productionBranch: 'main',
      },
      'vercel-sync-predeploy-env-vars': {
        syncedKeys: ['DATABASE_URL'],
        syncPhase: 'sync-predeploy-env-vars',
      },
      'vercel-deploy-preview': {
        deploymentId: 'dpl_vercel_001',
        previewUrl: 'https://sample-nextjs-app-abc123.vercel.app',
        readyState: 'QUEUED',
      },
      'vercel-wait-for-ready': {
        deploymentId: 'dpl_vercel_001',
        readyState: 'READY',
        previewUrl: 'https://sample-nextjs-app-abc123.vercel.app',
      },
      'vercel-health-check': {
        url: 'https://sample-nextjs-app-abc123.vercel.app',
        statusCode: 200,
        responseTimeMs: 150,
        healthy: true,
      },
    };

    function createRecordingProvider(providerName: string): ProviderPack {
      return {
        name: providerName,
        actions: [],
        discover: () => Promise.resolve({ connected: true, metadata: {} }),
        plan: () => Promise.resolve([]),
        apply: (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
          appliedTasks.push(task.id);

          // Validate that upstream outputs are accessible
          if (task.id === 'github-push-code') {
            const branch = ctx.getOutput('github-create-repo', 'defaultBranch');
            expect(branch).toBe('main');
          }

          if (task.id === 'neon-create-database') {
            const projectId = ctx.getOutput('neon-create-project', 'projectId');
            const branchId = ctx.getOutput('neon-create-project', 'branchId');
            expect(projectId).toBe('neon-proj-001');
            expect(branchId).toBe('br-main-001');
          }

          if (task.id === 'neon-capture-database-url') {
            const dbUrl = ctx.getOutput('neon-create-project', 'databaseUrl');
            expect(dbUrl).toBeTruthy();
          }

          if (task.id === 'vercel-link-repository') {
            const projectId = ctx.getOutput('vercel-create-project', 'projectId');
            const repoFullName = ctx.getOutput('github-create-repo', 'repoFullName');
            const repoId = ctx.getOutput('github-create-repo', 'repoId');
            const ownerId = ctx.getOutput('github-create-repo', 'ownerId');
            expect(projectId).toBe('prj_vercel_001');
            expect(repoFullName).toBe('testuser/sample-nextjs-app');
            expect(repoId).toBe(12345);
            expect(ownerId).toBe(99);
          }

          if (task.id === 'vercel-sync-predeploy-env-vars') {
            const dbUrl = ctx.getOutput('neon-capture-database-url', 'databaseUrl');
            expect(dbUrl).toBeTruthy();
            expect(typeof dbUrl).toBe('string');
          }

          if (task.id === 'vercel-deploy-preview') {
            const projectId =
              ctx.getOutput('vercel-link-repository', 'projectId') ??
              ctx.getOutput('vercel-create-project', 'projectId');
            const sha = ctx.getOutput('github-push-code', 'latestCommitSha');
            expect(projectId).toBe('prj_vercel_001');
            expect(sha).toBe('abc123def456');
          }

          if (task.id === 'vercel-wait-for-ready') {
            const deploymentId = ctx.getOutput('vercel-deploy-preview', 'deploymentId');
            expect(deploymentId).toBe('dpl_vercel_001');
          }

          if (task.id === 'vercel-health-check') {
            const previewUrl = ctx.getOutput('vercel-wait-for-ready', 'previewUrl');
            expect(previewUrl).toBe('https://sample-nextjs-app-abc123.vercel.app');
          }

          const outputs = mockOutputs[task.id] ?? {};
          outputLog.set(task.id, outputs);

          return Promise.resolve({ success: true, outputs });
        },
        verify: () => Promise.resolve({ success: true }),
        rollback: () => Promise.resolve({ success: true }),
      };
    }

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        github: createRecordingProvider('github'),
        neon: createRecordingProvider('neon'),
        vercel: createRecordingProvider('vercel'),
      },
      credentialResolver: (provider: string) =>
        Promise.resolve({ provider, values: { token: `${provider}-mock-token` } }),
      sleep: () => Promise.resolve(),
    });

    const scan = createFixtureScan('/tmp/fake-project');
    const plan = createRunPlanFromProjectScan(scan);
    plan.status = 'approved';

    const result = await executor.execute({ runPlan: plan });

    expect(result.runPlan.status).toBe('completed');
    expect(appliedTasks).toEqual(EXPECTED_TASK_IDS);

    // Verify final outputs are stored on the plan's tasks
    const waitTask = result.runPlan.tasks.find((t) => t.id === 'vercel-wait-for-ready')!;
    expect(waitTask.outputs.readyState).toBe('READY');
    expect(waitTask.outputs.previewUrl).toBe('https://sample-nextjs-app-abc123.vercel.app');

    store.close();
  });

  it('resume skips completed tasks and continues from failure point', async () => {
    const attempts = new Map<string, number>();
    let shouldFailNeonCreate = true;

    const mockOutputs: Record<string, Record<string, unknown>> = {
      'github-create-repo': {
        repoId: 12345, repoName: 'sample-nextjs-app',
        repoFullName: 'testuser/sample-nextjs-app',
        repoUrl: 'https://github.com/testuser/sample-nextjs-app',
        owner: 'testuser', ownerId: 99, defaultBranch: 'main',
      },
      'github-push-code': { branch: 'main', fileCount: 7, latestCommitSha: 'abc123' },
      'neon-create-project': {
        projectId: 'neon-proj-001', projectName: 'sample-nextjs-app-db',
        branchId: 'br-main-001',
        databaseUrl: 'postgresql://user:pass@host/db',
      },
      'neon-create-database': {
        databaseName: 'sample-nextjs-app', projectId: 'neon-proj-001',
        branchId: 'br-main-001', ownerName: 'neondb_owner',
      },
      'neon-capture-database-url': { databaseUrl: 'postgresql://user:pass@host/db' },
      'vercel-create-project': { projectId: 'prj_001', projectName: 'sample-nextjs-app' },
      'vercel-link-repository': {
        projectId: 'prj_001', projectName: 'sample-nextjs-app',
        linkedRepo: 'testuser/sample-nextjs-app', productionBranch: 'main',
      },
      'vercel-sync-predeploy-env-vars': { syncedKeys: ['DATABASE_URL'], syncPhase: 'sync-predeploy-env-vars' },
      'vercel-deploy-preview': {
        deploymentId: 'dpl_001', previewUrl: 'https://app.vercel.app', readyState: 'QUEUED',
      },
      'vercel-wait-for-ready': {
        deploymentId: 'dpl_001', readyState: 'READY', previewUrl: 'https://app.vercel.app',
      },
    };

    function createProvider(name: string): ProviderPack {
      return {
        name,
        actions: [],
        discover: () => Promise.resolve({ connected: true, metadata: {} }),
        plan: () => Promise.resolve([]),
        apply: (task: Task): Promise<TaskResult> => {
          attempts.set(task.id, (attempts.get(task.id) ?? 0) + 1);

          if (task.id === 'neon-create-project' && shouldFailNeonCreate) {
            shouldFailNeonCreate = false;
            return Promise.reject(new Error('Neon API temporarily unavailable'));
          }

          return Promise.resolve({
            success: true,
            outputs: mockOutputs[task.id] ?? {},
          });
        },
        verify: () => Promise.resolve({ success: true }),
        rollback: () => Promise.resolve({ success: true }),
      };
    }

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        github: createProvider('github'),
        neon: createProvider('neon'),
        vercel: createProvider('vercel'),
      },
      credentialResolver: (provider: string) =>
        Promise.resolve({ provider, values: { token: `${provider}-token` } }),
      sleep: () => Promise.resolve(),
    });

    const scan = createFixtureScan('/tmp/fake-project');
    const plan = createRunPlanFromProjectScan(scan, { idGenerator: () => 'run_resume_test' });
    plan.status = 'approved';

    // First execution: neon-create-project fails
    const firstResult = await executor.execute({
      runPlan: { ...plan, tasks: plan.tasks.map((t) => ({ ...t, retryPolicy: { maxRetries: 0, backoffMs: 0 } })) },
    });
    expect(firstResult.runPlan.status).toBe('failed');

    // Resume: neon-create-project succeeds, completed tasks are NOT re-executed
    const resumeResult = await executor.resume('run_resume_test');
    expect(resumeResult.runPlan.status).toBe('completed');

    // github-create-repo ran once (first run), not again on resume
    expect(attempts.get('github-create-repo')).toBe(1);
    // neon-create-project ran twice (failed first, succeeded on resume)
    expect(attempts.get('neon-create-project')).toBe(2);
    // vercel-wait-for-ready ran once (only on resume)
    expect(attempts.get('vercel-wait-for-ready')).toBe(1);

    store.close();
  });
});
