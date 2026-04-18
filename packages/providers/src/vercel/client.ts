import type { Credentials } from '@assembler/types';

import { requestJson } from '../shared/http.js';

export interface VercelProjectResponse {
  id: string;
  name: string;
  link?: {
    repo?: string;
    repoId?: number | string;
    productionBranch?: string;
  };
}

interface VercelDeploymentResponse {
  id: string;
  url: string;
  inspectorUrl?: string | null;
  readyState?: string;
}

export class VercelClient {
  private readonly token: string;
  private readonly teamId: string | undefined;
  private readonly slug: string | undefined;

  constructor(creds: Credentials) {
    const token = creds.values.token;
    if (!token) {
      throw new Error('Vercel credentials must include a token value.');
    }

    this.token = token;
    this.teamId = asOptionalString(creds.values.teamId);
    this.slug = asOptionalString(creds.values.slug);
  }

  getUser(): Promise<{ user: { id: string; username: string; name?: string } }> {
    return requestJson<{ user: { id: string; username: string; name?: string } }>(
      this.apiUrl('/v2/user'),
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  listIntegrations(): Promise<{ configurations: Array<{ slug: string; id: string }> }> {
    return requestJson<{ configurations: Array<{ slug: string; id: string }> }>(
      this.apiUrl('/v1/integrations/configurations'),
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  listProjects(filters?: {
    repoUrl?: string;
    repo?: string;
    limit?: number;
  }): Promise<{ projects: VercelProjectResponse[] }> {
    const url = new URL(this.apiUrl('/v10/projects'));
    if (filters?.repoUrl) url.searchParams.set('repoUrl', filters.repoUrl);
    if (filters?.repo) url.searchParams.set('repo', filters.repo);
    if (filters?.limit) url.searchParams.set('limit', String(filters.limit));

    return requestJson<{ projects: VercelProjectResponse[] }>(url.toString(), {
      method: 'GET',
      headers: this.headers(),
    });
  }

  createProject(input: {
    name: string;
    framework?: string;
    gitRepository?: {
      type: 'github';
      repo: string;
      repoId: string | number;
      repoOwnerId: string | number;
      productionBranch?: string;
    };
  }): Promise<VercelProjectResponse> {
    return requestJson<VercelProjectResponse>(this.apiUrl('/v11/projects'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: input.name,
        ...(input.framework ? { framework: input.framework } : {}),
        ...(input.gitRepository ? { gitRepository: input.gitRepository } : {}),
      }),
    });
  }

  updateProject(
    idOrName: string,
    body: Record<string, unknown>,
  ): Promise<VercelProjectResponse> {
    return requestJson<VercelProjectResponse>(this.apiUrl(`/v9/projects/${idOrName}`), {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
  }

  getProject(idOrName: string): Promise<VercelProjectResponse> {
    return requestJson<VercelProjectResponse>(this.apiUrl(`/v9/projects/${idOrName}`), {
      method: 'GET',
      headers: this.headers(),
    });
  }

  createProjectEnv(
    projectIdOrName: string,
    input: {
      key: string;
      value: string;
      target: Array<'preview' | 'production'>;
      type?: 'encrypted' | 'plain';
    },
  ): Promise<Record<string, unknown>> {
    const url = new URL(this.apiUrl(`/v10/projects/${projectIdOrName}/env`));
    url.searchParams.set('upsert', 'true');

    return requestJson<Record<string, unknown>>(
      url.toString(),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          key: input.key,
          value: input.value,
          target: input.target,
          type: input.type ?? 'encrypted',
        }),
      },
    );
  }

  listProjectEnvVars(
    projectIdOrName: string,
  ): Promise<{
    envs: Array<{
      id: string;
      key: string;
      value: string;
      target: string[];
      type: string;
    }>;
  }> {
    return requestJson<{
      envs: Array<{
        id: string;
        key: string;
        value: string;
        target: string[];
        type: string;
      }>;
    }>(this.apiUrl(`/v9/projects/${projectIdOrName}/env?decrypt=true`), {
      method: 'GET',
      headers: this.headers(),
    });
  }

  createDeployment(input: {
    name: string;
    project: string;
    repoId: string | number;
    ref: string;
    sha: string;
    target?: 'preview' | 'production';
  }): Promise<VercelDeploymentResponse> {
    return requestJson<VercelDeploymentResponse>(this.apiUrl('/v13/deployments'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: input.name,
        project: input.project,
        target: input.target ?? 'preview',
        gitSource: {
          type: 'github',
          repoId: String(input.repoId),
          ref: input.ref,
          sha: input.sha,
        },
      }),
    });
  }

  getDeployment(idOrUrl: string): Promise<VercelDeploymentResponse> {
    return requestJson<VercelDeploymentResponse>(this.apiUrl(`/v13/deployments/${idOrUrl}`), {
      method: 'GET',
      headers: this.headers(),
    });
  }

  addDomain(
    projectIdOrName: string,
    domain: string,
  ): Promise<{ name: string; verified: boolean; configured: boolean }> {
    return requestJson<{ name: string; verified: boolean; configured: boolean }>(
      this.apiUrl(`/v10/projects/${projectIdOrName}/domains`),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ name: domain }),
      },
    );
  }

  listDomains(
    projectIdOrName: string,
  ): Promise<{
    domains: Array<{ name: string; verified: boolean; configured: boolean }>;
  }> {
    return requestJson<{
      domains: Array<{ name: string; verified: boolean; configured: boolean }>;
    }>(this.apiUrl(`/v10/projects/${projectIdOrName}/domains`), {
      method: 'GET',
      headers: this.headers(),
    });
  }

  async removeDomain(projectIdOrName: string, domain: string): Promise<void> {
    await requestJson<Record<string, never>>(
      this.apiUrl(`/v10/projects/${projectIdOrName}/domains/${domain}`),
      {
        method: 'DELETE',
        headers: this.headers(),
      },
    );
  }

  async deleteProject(idOrName: string): Promise<void> {
    await requestJson<Record<string, never>>(this.apiUrl(`/v9/projects/${idOrName}`), {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  private apiUrl(pathname: string): string {
    const url = new URL(`https://api.vercel.com${pathname}`);

    if (this.teamId) {
      url.searchParams.set('teamId', this.teamId);
    }

    if (this.slug) {
      url.searchParams.set('slug', this.slug);
    }

    return url.toString();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}

function asOptionalString(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
