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
} from '@assembler/types';

import { HttpError } from '../shared/http.js';
import { SentryClient } from './client.js';

export const sentryProviderPack: ProviderPack = {
  name: 'sentry',
  actions: ['capture-dsn'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'SENTRY_TOKEN_MISSING',
            message: 'No Sentry auth token configured.',
            remediation:
              'Add your Sentry auth token with "assembler creds add sentry <auth-token>". Create one at https://sentry.io/settings/account/api/auth-tokens/',
            url: 'https://sentry.io/settings/account/api/auth-tokens/',
          },
        ],
      };
    }

    const token = String(creds.values.token);

    if (!SentryClient.isValidTokenFormat(token)) {
      errors.push({
        code: 'SENTRY_TOKEN_FORMAT_INVALID',
        message:
          'The Sentry token does not look valid. Expected a token starting with sntrys_ or a 64-character hex string.',
        remediation:
          'Make sure you are using a Sentry auth token. Create one at https://sentry.io/settings/account/api/auth-tokens/',
        url: 'https://sentry.io/settings/account/api/auth-tokens/',
      });

      return { valid: false, errors };
    }

    const client = new SentryClient(creds);

    try {
      await client.getOrganizations();
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        errors.push({
          code: 'SENTRY_TOKEN_INVALID',
          message: 'Your Sentry auth token is invalid or has been revoked.',
          remediation:
            'Generate a new auth token at https://sentry.io/settings/account/api/auth-tokens/ and update with "assembler creds add sentry <auth-token>".',
          url: 'https://sentry.io/settings/account/api/auth-tokens/',
        });
      } else {
        errors.push({
          code: 'SENTRY_PREFLIGHT_ERROR',
          message: `Sentry API check failed: ${error instanceof Error ? error.message : String(error)}`,
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
      ...(tokenPresent ? {} : { error: 'Missing Sentry auth token.' }),
    });
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `Sentry ${action}`,
      provider: 'sentry',
      action,
      params: asParams(params),
      risk: 'low',
      requiresApproval: false,
      retryPolicy: {
        maxRetries: 1,
        backoffMs: 500,
      },
      timeoutMs: 15_000,
    }),
  ],
  apply: async (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
    const client = new SentryClient(await ctx.getCredential('sentry'));

    switch (task.action) {
      case 'capture-dsn': {
        const orgs = await client.getOrganizations();
        if (orgs.length === 0) {
          throw new Error(
            'No Sentry organizations found. Create an organization at https://sentry.io/organizations/new/',
          );
        }

        const orgSlug = asOptionalString(task.params.orgSlug) ?? orgs[0]!.slug;
        const projectSlug = asOptionalString(task.params.projectSlug);

        let targetProject: { orgSlug: string; projectSlug: string } | undefined;

        if (projectSlug) {
          targetProject = { orgSlug, projectSlug };
        } else {
          const projects = await client.getProjects(orgSlug);
          if (projects.length === 0) {
            throw new Error(
              `No Sentry projects found in organization "${orgSlug}". Create a project at https://sentry.io/organizations/${orgSlug}/projects/new/`,
            );
          }

          const nextjsProject = projects.find(
            (p) =>
              p.slug.includes('next') ||
              p.slug.includes('nextjs') ||
              p.name.toLowerCase().includes('next'),
          );
          targetProject = {
            orgSlug,
            projectSlug: (nextjsProject ?? projects[0]!).slug,
          };
        }

        const keys = await client.getProjectKeys(
          targetProject.orgSlug,
          targetProject.projectSlug,
        );
        const activeKey = keys.find((k) => k.isActive);
        if (!activeKey) {
          throw new Error(
            `No active client keys found for project "${targetProject.projectSlug}". Check your project settings at https://sentry.io/settings/${targetProject.orgSlug}/projects/${targetProject.projectSlug}/keys/`,
          );
        }

        ctx.log('info', `Captured Sentry DSN for project "${targetProject.projectSlug}".`, {
          provider: 'sentry',
          orgSlug: targetProject.orgSlug,
          projectSlug: targetProject.projectSlug,
        });

        return {
          success: true,
          outputs: {
            dsn: activeKey.dsn.public,
            orgSlug: targetProject.orgSlug,
            projectSlug: targetProject.projectSlug,
          },
          message: `Captured Sentry DSN for project ${targetProject.projectSlug} in org ${targetProject.orgSlug}.`,
        };
      }
      default:
        throw new Error(`Unsupported sentry action "${task.action}".`);
    }
  },
  verify: async (): Promise<VerifyResult> =>
    Promise.resolve({
      success: true,
    }),
  rollback: async (): Promise<RollbackResult> =>
    Promise.resolve({
      success: true,
    }),
};

function asParams(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
