import type { Credentials } from '@devassemble/types';

import { requestJson } from '../shared/http.js';

export interface GitHubUserResponse {
  login: string;
  id: number;
}

export interface GitHubRepositoryResponse {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
}

export class GitHubClient {
  private readonly token: string;

  constructor(creds: Credentials) {
    const token = creds.values.token;
    if (!token) {
      throw new Error('GitHub credentials must include a token value.');
    }
    this.token = token;
  }

  getViewer(): Promise<GitHubUserResponse> {
    return requestJson<GitHubUserResponse>('https://api.github.com/user', {
      method: 'GET',
      headers: this.headers(),
    });
  }

  createRepository(input: {
    name: string;
    description?: string;
    private?: boolean;
  }): Promise<GitHubRepositoryResponse> {
    return requestJson<GitHubRepositoryResponse>('https://api.github.com/user/repos', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        ...(input.private === undefined ? {} : { private: input.private }),
      }),
    });
  }

  getRepository(owner: string, repo: string): Promise<GitHubRepositoryResponse> {
    return requestJson<GitHubRepositoryResponse>(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    await requestJson<Record<string, never>>(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }
}
