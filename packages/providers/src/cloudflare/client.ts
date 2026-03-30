import type { Credentials } from '@devassemble/types';

import { requestJson } from '../shared/http.js';

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

export interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

export class CloudflareClient {
  private readonly token: string;

  constructor(creds: Credentials) {
    const token = creds.values.token;
    if (!token) {
      throw new Error('Cloudflare credentials must include a token value.');
    }
    this.token = token;
  }

  verifyToken(): Promise<{ id: string; status: string }> {
    return this.cfRequest<{ id: string; status: string }>('/user/tokens/verify', {
      method: 'GET',
    });
  }

  listZones(domain: string): Promise<CloudflareZone[]> {
    return this.cfRequest<CloudflareZone[]>(`/zones?name=${encodeURIComponent(domain)}`, {
      method: 'GET',
    });
  }

  createDnsRecord(
    zoneId: string,
    input: {
      type: 'CNAME' | 'A' | 'AAAA';
      name: string;
      content: string;
      proxied?: boolean;
      ttl?: number;
    },
  ): Promise<CloudflareDnsRecord> {
    return this.cfRequest<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: input.type,
        name: input.name,
        content: input.content,
        proxied: input.proxied ?? true,
        ttl: input.ttl ?? 1,
      }),
    });
  }

  listDnsRecords(
    zoneId: string,
    filters?: { name?: string; type?: string },
  ): Promise<CloudflareDnsRecord[]> {
    const url = new URL(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`);
    if (filters?.name) url.searchParams.set('name', filters.name);
    if (filters?.type) url.searchParams.set('type', filters.type);

    return this.cfRequest<CloudflareDnsRecord[]>(
      url.pathname + url.search,
      { method: 'GET' },
    );
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.cfRequest<{ id: string }>(
      `/zones/${zoneId}/dns_records/${recordId}`,
      { method: 'DELETE' },
    );
  }

  private async cfRequest<T>(path: string, init: RequestInit): Promise<T> {
    const url = path.startsWith('https://')
      ? path
      : `https://api.cloudflare.com/client/v4${path}`;

    const response = await requestJson<CloudflareApiResponse<T>>(url, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!response.success) {
      const messages = response.errors.map((e) => e.message).join(', ');
      throw new Error(`Cloudflare API error: ${messages}`);
    }

    return response.result;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }
}
