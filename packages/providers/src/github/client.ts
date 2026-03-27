import type { Credentials } from '@devassemble/types';

import { HttpError, requestJson } from '../shared/http.js';

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
  owner: {
    login: string;
    id: number;
  };
}

interface GitHubContentResponse {
  sha: string;
}

interface GitHubCreateOrUpdateFileResponse {
  content: {
    path: string;
    sha: string;
  };
  commit: {
    sha: string;
  };
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
        auto_init: true,
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

  async createOrUpdateFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
  }): Promise<GitHubCreateOrUpdateFileResponse> {
    const existing = await this.getFile(input.owner, input.repo, input.path, input.branch);

    return requestJson<GitHubCreateOrUpdateFileResponse>(
      `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${encodePathSegment(input.path)}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({
          message: input.message,
          content: Buffer.from(input.content, 'utf8').toString('base64'),
          ...(input.branch ? { branch: input.branch } : {}),
          ...(existing?.sha ? { sha: existing.sha } : {}),
        }),
      },
    );
  }

  private async getFile(
    owner: string,
    repo: string,
    path: string,
    branch?: string,
  ): Promise<GitHubContentResponse | undefined> {
    const url = new URL(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodePathSegment(path)}`,
    );

    if (branch) {
      url.searchParams.set('ref', branch);
    }

    try {
      return await requestJson<GitHubContentResponse>(url.toString(), {
        method: 'GET',
        headers: this.headers(),
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return undefined;
      }

      throw error;
    }
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

function encodePathSegment(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
