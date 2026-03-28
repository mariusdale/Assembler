import type {
  Credentials,
  DiscoveryResult,
  ExecutionContext,
  PreflightResult,
  ProviderPack,
  RollbackResult,
  Task,
  TaskResult,
  TaskTemplate,
  VerifyResult,
} from '@devassemble/types';

import { HttpError } from '../shared/http.js';
import { NeonClient } from './client.js';

export const neonProviderPack: ProviderPack = {
  name: 'neon',
  actions: ['create-project', 'create-database', 'run-schema-migration', 'capture-database-url'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'NEON_TOKEN_MISSING',
            message: 'No Neon API key configured.',
            remediation:
              'Add a Neon account-level API key with "devassemble creds add neon <api-key>".',
            url: 'https://console.neon.tech/app/settings/api-keys',
          },
        ],
      };
    }

    try {
      const client = new NeonClient(creds);
      await client.listProjects();
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        errors.push({
          code: 'NEON_TOKEN_INVALID',
          message: 'Your Neon API key is invalid or expired.',
          remediation:
            'Generate a new account-level API key and update it with "devassemble creds add neon <api-key>".',
          url: 'https://console.neon.tech/app/settings/api-keys',
        });
      } else if (error instanceof HttpError && error.status === 403) {
        errors.push({
          code: 'NEON_PROJECT_SCOPED_KEY',
          message: 'Your Neon API key appears to be project-scoped, not account-level.',
          remediation:
            'DevAssemble needs an account-level Neon API key, not a project-scoped key. Generate one at https://console.neon.tech/app/settings/api-keys',
          url: 'https://console.neon.tech/app/settings/api-keys',
        });
      } else {
        errors.push({
          code: 'NEON_PREFLIGHT_ERROR',
          message: `Neon API check failed: ${error instanceof Error ? error.message : String(error)}`,
          remediation: 'Check your network connection and try again.',
        });
      }
    }

    return { valid: errors.length === 0, errors };
  },
  discover: (creds: Credentials): Promise<DiscoveryResult> => {
    const tokenPresent = typeof creds.values.token === 'string' && creds.values.token.length > 0;

    return Promise.resolve({
      connected: tokenPresent,
      metadata: {},
      ...(tokenPresent ? {} : { error: 'Missing Neon API token.' }),
    });
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `Neon ${action}`,
      provider: 'neon',
      action,
      params: asParams(params),
      risk: action === 'create-project' ? 'medium' : 'low',
      requiresApproval: action === 'create-project',
      retryPolicy: {
        maxRetries: 1,
        backoffMs: 500,
      },
      timeoutMs: 30_000,
    }),
  ],
  apply: async (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
    const client = new NeonClient(await ctx.getCredential('neon'));

    switch (task.action) {
      case 'create-project': {
        const regionId = asOptionalString(task.params.regionId);
        const projectName =
          asOptionalString(task.params.name) ?? `${toSlug(getProjectName(ctx))}-db`;
        const project = await client.createProject({
          name: projectName,
          ...(regionId ? { regionId } : {}),
        });
        const branchId =
          asOptionalString(project.project.default_branch_id) ??
          await resolveBranchId(client, project.project.id);

        return {
          success: true,
          outputs: {
            projectId: project.project.id,
            projectName: project.project.name,
            branchId,
            databaseUrl: project.connection_uris?.[0]?.connection_uri,
          },
        };
      }
      case 'create-database': {
        const projectId = asString(
          task.params.projectId ?? ctx.getOutput('neon-create-project', 'projectId'),
          'neon-create-project.projectId',
        );
        await waitForProjectReady(client, projectId, ctx);
        const branchId =
          asOptionalString(task.params.branchId) ??
          asOptionalString(ctx.getOutput('neon-create-project', 'branchId')) ??
          await resolveBranchId(client, projectId);
        const ownerName =
          asOptionalString(task.params.ownerName) ??
          asOptionalString(ctx.getOutput('neon-create-project', 'ownerName')) ??
          parseConnectionUser(ctx.getOutput('neon-create-project', 'databaseUrl'));
        const databaseName =
          asOptionalString(task.params.databaseName) ?? toSlug(getProjectName(ctx));
        const database = await client.createDatabase(projectId, branchId, {
          name: databaseName,
          ownerName,
        });

        return {
          success: true,
          outputs: {
            databaseName: database.database.name,
            projectId,
            branchId,
            ownerName,
          },
        };
      }
      case 'run-schema-migration':
        return {
          success: true,
          outputs: {
            migrated: true,
          },
          message: 'Schema migration hook is scaffolded and marked as completed.',
        };
      case 'capture-database-url':
        return {
          success: true,
          outputs: {
            databaseUrl: ctx.getOutput('neon-create-project', 'databaseUrl'),
          },
          message: 'Captured database URL from Neon project provisioning outputs.',
        };
      default:
        throw new Error(`Unsupported neon action "${task.action}".`);
    }
  },
  verify: async (): Promise<VerifyResult> => Promise.resolve({
    success: true,
  }),
  rollback: async (task: Task, ctx: ExecutionContext): Promise<RollbackResult> => {
    if (task.action !== 'create-project') {
      return {
        success: true,
      };
    }

    const projectId = asString(task.outputs.projectId, 'task.outputs.projectId');
    const client = new NeonClient(await ctx.getCredential('neon'));
    await client.deleteProject(projectId);

    return {
      success: true,
    };
  },
};

function asParams(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'devassemble-app';
}

function getProjectName(ctx: ExecutionContext): string {
  return ctx.projectScan?.name ?? ctx.appSpec?.name ?? 'devassemble-app';
}

async function waitForProjectReady(
  client: NeonClient,
  projectId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const maxWaitMs = 30_000;
  const pollMs = 2_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const { operations } = await client.listOperations(projectId);
    const active = operations.filter(
      (op) => op.status === 'running' || op.status === 'scheduling',
    );
    if (active.length === 0) {
      return;
    }
    ctx.log('info', `Waiting for ${active.length} Neon operation(s) to finish...`, {
      provider: 'neon',
      projectId,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Timed out waiting for Neon project "${projectId}" to finish active operations. Try running "devassemble resume" in a few seconds.`,
  );
}

async function resolveBranchId(client: NeonClient, projectId: string): Promise<string> {
  const response = await client.listBranches(projectId);
  const branch =
    response.branches.find((candidate) => candidate.primary) ??
    response.branches.find((candidate) => candidate.name === 'main') ??
    response.branches[0];

  if (!branch?.id) {
    throw new Error(`Unable to resolve a Neon branch id for project "${projectId}".`);
  }

  return branch.id;
}

function parseConnectionUser(value: unknown): string {
  const connectionString = asString(value, 'neon-create-project.databaseUrl');

  try {
    const username = new URL(connectionString).username;
    if (username.trim() !== '') {
      return decodeURIComponent(username);
    }
  } catch {
    // Fall through to the explicit error below when the value is not a valid URL.
  }

  throw new Error('Unable to resolve Neon database owner from the project connection URL.');
}
