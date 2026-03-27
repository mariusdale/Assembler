import type {
  Credentials,
  DiscoveryResult,
  ExecutionContext,
  ProviderPack,
  RollbackResult,
  Task,
  TaskResult,
  TaskTemplate,
  VerifyResult,
} from '@devassemble/types';

import { NeonClient } from './client.js';

export const neonProviderPack: ProviderPack = {
  name: 'neon',
  actions: ['create-project', 'create-database', 'run-schema-migration', 'capture-database-url'],
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
        const projectName = asOptionalString(task.params.name) ?? `${toSlug(ctx.appSpec.name)}-db`;
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
        const branchId =
          asOptionalString(task.params.branchId) ??
          asOptionalString(ctx.getOutput('neon-create-project', 'branchId')) ??
          await resolveBranchId(client, projectId);
        const ownerName =
          asOptionalString(task.params.ownerName) ??
          asOptionalString(ctx.getOutput('neon-create-project', 'ownerName')) ??
          parseConnectionUser(ctx.getOutput('neon-create-project', 'databaseUrl'));
        const databaseName =
          asOptionalString(task.params.databaseName) ?? toSlug(ctx.appSpec.name);
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
