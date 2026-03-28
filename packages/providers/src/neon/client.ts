import type { Credentials } from '@devassemble/types';

import { requestJson } from '../shared/http.js';

export interface NeonProjectResponse {
  project: {
    id: string;
    name: string;
    region_id: string;
    default_branch_id?: string;
  };
  connection_uris?: Array<{
    connection_uri: string;
    database_name?: string;
  }>;
}

export interface NeonBranchResponse {
  branch: {
    id: string;
    name: string;
  };
}

export interface NeonBranchListResponse {
  branches: Array<{
    id: string;
    name: string;
    primary?: boolean;
  }>;
}

export interface NeonDatabaseResponse {
  database: {
    id?: number;
    name: string;
    owner_name?: string;
  };
}

export class NeonClient {
  private readonly token: string;

  constructor(creds: Credentials) {
    const token = creds.values.token;
    if (!token) {
      throw new Error('Neon credentials must include a token value.');
    }
    this.token = token;
  }

  listProjects(): Promise<{ projects: Array<{ id: string; name: string }> }> {
    return requestJson<{ projects: Array<{ id: string; name: string }> }>(
      'https://console.neon.tech/api/v2/projects',
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  createProject(input: {
    name: string;
    regionId?: string;
  }): Promise<NeonProjectResponse> {
    return requestJson<NeonProjectResponse>('https://console.neon.tech/api/v2/projects', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        project: {
          name: input.name,
          ...(input.regionId ? { region_id: input.regionId } : {}),
        },
      }),
    });
  }

  createBranch(projectId: string, branchName: string): Promise<NeonBranchResponse> {
    return requestJson<NeonBranchResponse>(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          branch: {
            name: branchName,
          },
          endpoints: [
            {
              type: 'read_write',
            },
          ],
        }),
      },
    );
  }

  createDatabase(
    projectId: string,
    branchId: string,
    input: {
      name: string;
      ownerName: string;
    },
  ): Promise<NeonDatabaseResponse> {
    return requestJson<NeonDatabaseResponse>(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}/databases`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          database: {
            name: input.name,
            owner_name: input.ownerName,
          },
        }),
      },
    );
  }

  listBranches(projectId: string): Promise<NeonBranchListResponse> {
    return requestJson<NeonBranchListResponse>(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    await requestJson<Record<string, never>>(
      `https://console.neon.tech/api/v2/projects/${projectId}`,
      {
        method: 'DELETE',
        headers: this.headers(),
      },
    );
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }
}
