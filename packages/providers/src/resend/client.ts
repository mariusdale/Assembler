import type { Credentials } from '@assembler/types';

import { requestJson } from '../shared/http.js';

export interface ResendApiKey {
  id: string;
  name: string;
  created_at: string;
}

export interface ResendApiKeysResponse {
  data: ResendApiKey[];
}

export class ResendClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.resend.com';

  constructor(creds: Credentials) {
    const key = creds.values.token;
    if (!key) {
      throw new Error('Resend credentials must include a token value (API key).');
    }
    this.apiKey = key;
  }

  getApiKeys(): Promise<ResendApiKeysResponse> {
    return requestJson<ResendApiKeysResponse>(`${this.baseUrl}/api-keys`, {
      method: 'GET',
      headers: this.headers(),
    });
  }

  static isValidKeyFormat(key: string): boolean {
    return key.startsWith('re_');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
