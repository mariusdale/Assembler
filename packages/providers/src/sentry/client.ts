import type { Credentials } from '@devassemble/types';

import { requestJson } from '../shared/http.js';

export interface SentryOrganization {
  id: string;
  slug: string;
  name: string;
}

export interface SentryProject {
  id: string;
  slug: string;
  name: string;
  organization: {
    id: string;
    slug: string;
    name: string;
  };
}

export interface SentryProjectKey {
  id: string;
  name: string;
  dsn: {
    public: string;
    secret: string;
  };
  isActive: boolean;
}

export class SentryClient {
  private readonly token: string;
  private readonly baseUrl = 'https://sentry.io';

  constructor(creds: Credentials) {
    const key = creds.values.token;
    if (!key) {
      throw new Error('Sentry credentials must include a token value (auth token).');
    }
    this.token = key;
  }

  getOrganizations(): Promise<SentryOrganization[]> {
    return requestJson<SentryOrganization[]>(
      `${this.baseUrl}/api/0/organizations/`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  getProjects(orgSlug: string): Promise<SentryProject[]> {
    return requestJson<SentryProject[]>(
      `${this.baseUrl}/api/0/organizations/${orgSlug}/projects/`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  getProjectKeys(orgSlug: string, projectSlug: string): Promise<SentryProjectKey[]> {
    return requestJson<SentryProjectKey[]>(
      `${this.baseUrl}/api/0/projects/${orgSlug}/${projectSlug}/keys/`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  static isValidTokenFormat(token: string): boolean {
    return token.startsWith('sntrys_') || /^[0-9a-f]{64}$/i.test(token);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}
