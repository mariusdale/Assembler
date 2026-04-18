import type { Credentials, ExecutionContext, Task } from '@assembler/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cloudflareProviderPack } from '../src/cloudflare/index.js';

describe('cloudflare provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('preflight', () => {
    it('returns an error when the token is missing', async () => {
      const result = await cloudflareProviderPack.preflight!(
        { provider: 'cloudflare', values: {} } as Credentials,
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLOUDFLARE_TOKEN_MISSING');
    });

    it('returns an error when the token is invalid', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'Invalid' }] }), {
              status: 401,
            }),
          ),
        ),
      );

      const result = await cloudflareProviderPack.preflight!({
        provider: 'cloudflare',
        values: { token: 'invalid-token' },
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLOUDFLARE_TOKEN_INVALID');
    });

    it('passes preflight with a valid token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                errors: [],
                result: { id: 'tok_123', status: 'active' },
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await cloudflareProviderPack.preflight!({
        provider: 'cloudflare',
        values: { token: 'valid-cf-token' },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('apply: lookup-zone', () => {
    it('finds an existing zone', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                errors: [],
                result: [{ id: 'zone_abc', name: 'example.com', status: 'active' }],
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const task = createTask('lookup-zone');
      task.params.domain = 'app.example.com';

      const result = await cloudflareProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
      expect(result.outputs.zoneId).toBe('zone_abc');
      expect(result.outputs.zoneName).toBe('example.com');
    });

    it('throws when no zone is found', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ success: true, errors: [], result: [] }),
              { status: 200 },
            ),
          ),
        ),
      );

      const task = createTask('lookup-zone');
      task.params.domain = 'app.nonexistent.com';

      await expect(cloudflareProviderPack.apply(task, createExecutionContext())).rejects.toThrow(
        /No Cloudflare zone found/,
      );
    });
  });

  describe('apply: create-dns-record', () => {
    it('creates a new DNS record', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((_input: string | URL, init?: RequestInit) => {
          // listDnsRecords (GET) — no existing records
          if (!init?.method || init.method === 'GET') {
            return Promise.resolve(
              new Response(
                JSON.stringify({ success: true, errors: [], result: [] }),
                { status: 200 },
              ),
            );
          }

          // createDnsRecord (POST)
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                errors: [],
                result: {
                  id: 'rec_123',
                  type: 'CNAME',
                  name: 'app.example.com',
                  content: 'cname.vercel-dns.com',
                  proxied: true,
                  ttl: 1,
                },
              }),
              { status: 200 },
            ),
          );
        }),
      );

      const task = createTask('create-dns-record');
      task.params.domain = 'app.example.com';
      task.params.zoneId = 'zone_abc';

      const result = await cloudflareProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
      expect(result.outputs.recordId).toBe('rec_123');
      expect(result.outputs.recordContent).toBe('cname.vercel-dns.com');
    });

    it('returns existing record idempotently', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                errors: [],
                result: [
                  {
                    id: 'rec_existing',
                    type: 'CNAME',
                    name: 'app.example.com',
                    content: 'cname.vercel-dns.com',
                    proxied: true,
                    ttl: 1,
                  },
                ],
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const task = createTask('create-dns-record');
      task.params.domain = 'app.example.com';
      task.params.zoneId = 'zone_abc';

      const result = await cloudflareProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
      expect(result.outputs.recordId).toBe('rec_existing');
      expect(result.message).toMatch(/already exists/);
    });
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `cloudflare-${action}`,
    name: `Cloudflare ${action}`,
    provider: 'cloudflare',
    action,
    params: {},
    dependsOn: [],
    outputs: {},
    status: 'pending',
    risk: 'medium',
    requiresApproval: true,
    retryPolicy: { maxRetries: 1, backoffMs: 1_000 },
    timeoutMs: 30_000,
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    runId: 'run_test',
    appSpec: undefined,
    projectScan: undefined,
    getOutput(): unknown {
      return undefined;
    },
    getCredential(provider: string): Promise<Credentials> {
      return Promise.resolve({
        provider,
        values: { token: 'cf-test-token' },
      });
    },
    log(): void {},
    emitEvent(): void {},
  };
}
