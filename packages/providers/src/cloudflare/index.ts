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
import { CloudflareClient } from './client.js';

export const cloudflareProviderPack: ProviderPack = {
  name: 'cloudflare',
  actions: ['lookup-zone', 'create-dns-record', 'verify-dns'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'CLOUDFLARE_TOKEN_MISSING',
            message: 'No Cloudflare API token configured.',
            remediation:
              'Add your Cloudflare API token with "devassemble creds add cloudflare <api-token>". Create one at https://dash.cloudflare.com/profile/api-tokens with Zone:Read and DNS:Edit permissions.',
            url: 'https://dash.cloudflare.com/profile/api-tokens',
          },
        ],
      };
    }

    try {
      const client = new CloudflareClient(creds);
      const result = await client.verifyToken();
      if (result.status !== 'active') {
        errors.push({
          code: 'CLOUDFLARE_TOKEN_INACTIVE',
          message: `Your Cloudflare API token is ${result.status}.`,
          remediation:
            'Create a new API token at https://dash.cloudflare.com/profile/api-tokens with Zone:Read and DNS:Edit permissions.',
          url: 'https://dash.cloudflare.com/profile/api-tokens',
        });
      }
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        errors.push({
          code: 'CLOUDFLARE_TOKEN_INVALID',
          message: 'Your Cloudflare API token is invalid or has been revoked.',
          remediation:
            'Create a new API token at https://dash.cloudflare.com/profile/api-tokens with Zone:Read and DNS:Edit permissions.',
          url: 'https://dash.cloudflare.com/profile/api-tokens',
        });
      } else {
        errors.push({
          code: 'CLOUDFLARE_PREFLIGHT_ERROR',
          message: `Cloudflare API check failed: ${error instanceof Error ? error.message : String(error)}`,
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
      ...(tokenPresent ? {} : { error: 'Missing Cloudflare API token.' }),
    });
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `Cloudflare ${action}`,
      provider: 'cloudflare',
      action,
      params: asParams(params),
      risk: action === 'create-dns-record' ? 'high' : 'medium',
      requiresApproval: true,
      retryPolicy: {
        maxRetries: 1,
        backoffMs: 1_000,
      },
      timeoutMs: 30_000,
    }),
  ],
  apply: async (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
    const client = new CloudflareClient(await ctx.getCredential('cloudflare'));

    switch (task.action) {
      case 'lookup-zone': {
        const domain = asString(task.params.domain, 'task.params.domain');
        const rootDomain = extractRootDomain(domain);
        const zones = await client.listZones(rootDomain);

        if (zones.length === 0) {
          throw new Error(
            `No Cloudflare zone found for "${rootDomain}". Add the domain to your Cloudflare account first at https://dash.cloudflare.com`,
          );
        }

        const zone = zones[0]!;
        ctx.log('info', `Found Cloudflare zone "${zone.name}" (${zone.id}).`, {
          provider: 'cloudflare',
          zoneId: zone.id,
          zoneName: zone.name,
        });

        return {
          success: true,
          outputs: {
            zoneId: zone.id,
            zoneName: zone.name,
            zoneStatus: zone.status,
          },
        };
      }
      case 'create-dns-record': {
        const domain = asString(task.params.domain, 'task.params.domain');
        const zoneId = asString(
          task.params.zoneId ?? ctx.getOutput('cloudflare-lookup-zone', 'zoneId'),
          'cloudflare-lookup-zone.zoneId',
        );
        const content = asOptionalString(task.params.content) ?? 'cname.vercel-dns.com';
        const recordType = (asOptionalString(task.params.recordType) ?? 'CNAME') as 'CNAME' | 'A' | 'AAAA';

        // Idempotency: check if record already exists
        const existing = await client.listDnsRecords(zoneId, { name: domain, type: recordType });
        if (existing.length > 0) {
          const record = existing[0]!;
          ctx.log('info', `DNS record for "${domain}" already exists (${record.id}).`, {
            provider: 'cloudflare',
            recordId: record.id,
          });

          return {
            success: true,
            outputs: {
              recordId: record.id,
              recordName: record.name,
              recordType: record.type,
              recordContent: record.content,
              zoneId,
            },
            message: `DNS record for "${domain}" already exists.`,
          };
        }

        const record = await client.createDnsRecord(zoneId, {
          type: recordType,
          name: domain,
          content,
          proxied: true,
        });

        ctx.log('info', `Created ${record.type} record for "${record.name}" → ${record.content}.`, {
          provider: 'cloudflare',
          recordId: record.id,
        });

        return {
          success: true,
          outputs: {
            recordId: record.id,
            recordName: record.name,
            recordType: record.type,
            recordContent: record.content,
            zoneId,
          },
          message: `Created ${record.type} record for "${record.name}" pointing to ${record.content}.`,
        };
      }
      case 'verify-dns': {
        const domain = asString(task.params.domain, 'task.params.domain');
        const zoneId = asString(
          task.params.zoneId ?? ctx.getOutput('cloudflare-lookup-zone', 'zoneId'),
          'cloudflare-lookup-zone.zoneId',
        );

        const records = await client.listDnsRecords(zoneId, { name: domain });
        const verified = records.length > 0;

        ctx.log('info', `DNS verification for "${domain}": ${verified ? 'records found' : 'no records'}.`, {
          provider: 'cloudflare',
          verified,
          recordCount: records.length,
        });

        return {
          success: true,
          outputs: { verified, recordCount: records.length },
          message: verified
            ? `DNS records for "${domain}" are configured.`
            : `No DNS records found for "${domain}".`,
        };
      }
      default:
        throw new Error(`Unsupported cloudflare action "${task.action}".`);
    }
  },
  verify: async (): Promise<VerifyResult> =>
    Promise.resolve({
      success: true,
    }),
  rollback: async (task: Task, ctx: ExecutionContext): Promise<RollbackResult> => {
    if (task.action !== 'create-dns-record') {
      return { success: true };
    }

    const zoneId = asOptionalString(task.outputs.zoneId);
    const recordId = asOptionalString(task.outputs.recordId);

    if (zoneId && recordId) {
      const client = new CloudflareClient(await ctx.getCredential('cloudflare'));
      try {
        await client.deleteDnsRecord(zoneId, recordId);
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 404) {
          throw error;
        }
      }
    }

    return { success: true };
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

function extractRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join('.');
}
