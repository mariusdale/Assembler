import type { Credentials } from '@devassemble/types';

import { requestJson } from '../shared/http.js';

export interface StripeAccountResponse {
  id: string;
  object: 'account';
  business_profile?: {
    name?: string | null;
  };
  charges_enabled: boolean;
  details_submitted: boolean;
  email?: string | null;
  settings?: {
    dashboard?: {
      display_name?: string | null;
    };
  };
}

export class StripeClient {
  private readonly secretKey: string;

  constructor(creds: Credentials) {
    const key = creds.values.token;
    if (!key) {
      throw new Error('Stripe credentials must include a token value (secret key).');
    }
    this.secretKey = key;
  }

  getAccount(): Promise<StripeAccountResponse> {
    return requestJson<StripeAccountResponse>('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: this.headers(),
    });
  }

  isTestKey(): boolean {
    return this.secretKey.startsWith('sk_test_') || this.secretKey.startsWith('rk_test_');
  }

  isLiveKey(): boolean {
    return this.secretKey.startsWith('sk_live_') || this.secretKey.startsWith('rk_live_');
  }

  derivePublishableKeyPrefix(): 'pk_test_' | 'pk_live_' | undefined {
    if (this.isTestKey()) return 'pk_test_';
    if (this.isLiveKey()) return 'pk_live_';
    return undefined;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }
}
