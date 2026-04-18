import type { Credentials } from '@assembler/types';

import { requestJson } from '../shared/http.js';

export interface ClerkInstanceResponse {
  id: string;
  environment_type: 'development' | 'staging' | 'production';
  allowed_origins?: string[];
}

export class ClerkClient {
  private readonly secretKey: string;

  constructor(creds: Credentials) {
    const key = creds.values.token;
    if (!key) {
      throw new Error('Clerk credentials must include a token value (secret key).');
    }
    this.secretKey = key;
  }

  getInstance(): Promise<ClerkInstanceResponse> {
    return requestJson<ClerkInstanceResponse>('https://api.clerk.com/v1/instance', {
      method: 'GET',
      headers: this.headers(),
    });
  }

  isTestKey(): boolean {
    return this.secretKey.startsWith('sk_test_');
  }

  isLiveKey(): boolean {
    return this.secretKey.startsWith('sk_live_');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }
}
