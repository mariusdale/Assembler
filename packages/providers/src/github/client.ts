import type { Credentials } from '@devassemble/types';

import { HttpError, requestJson, requestJsonWithHeaders } from '../shared/http.js';

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

  async getViewerWithScopes(): Promise<{ user: GitHubUserResponse; scopes: string[] }> {
    const { data, headers } = await requestJsonWithHeaders<GitHubUserResponse>(
      'https://api.github.com/user',
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
    const scopeHeader = headers.get('x-oauth-scopes') ?? '';
    const scopes = scopeHeader
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { user: data, scopes };
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
    content: string | Buffer;
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
          content:
            typeof input.content === 'string'
              ? Buffer.from(input.content, 'utf8').toString('base64')
              : Buffer.from(input.content).toString('base64'),
          ...(input.branch ? { branch: input.branch } : {}),
          ...(existing?.sha ? { sha: existing.sha } : {}),
        }),
      },
    );
  }

  async createBlob(
    owner: string,
    repo: string,
    content: string,
    encoding: 'utf-8' | 'base64',
  ): Promise<{ sha: string }> {
    return requestJson(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ content, encoding }),
    });
  }

  async createTree(
    owner: string,
    repo: string,
    tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }>,
    baseTree?: string,
  ): Promise<{ sha: string }> {
    return requestJson(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        tree,
        ...(baseTree ? { base_tree: baseTree } : {}),
      }),
    });
  }

  async createCommit(
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parents: string[],
  ): Promise<{ sha: string }> {
    return requestJson(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ message, tree, parents }),
    });
  }

  async updateRef(owner: string, repo: string, ref: string, sha: string): Promise<void> {
    await requestJson(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${ref}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ sha }),
    });
  }

  async getRef(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ object: { sha: string } }> {
    return requestJson(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${ref}`, {
      method: 'GET',
      headers: this.headers(),
    });
  }

  async pushFiles(input: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: Array<{ path: string; content: Buffer }>;
  }): Promise<{ commitSha: string }> {
    // 1. Get current HEAD SHA
    const ref = await this.getRef(input.owner, input.repo, input.branch);
    const parentSha = ref.object.sha;

    // 2. Create blobs for each file
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];
    for (const file of input.files) {
      const blob = await this.createBlob(
        input.owner,
        input.repo,
        Buffer.from(file.content).toString('base64'),
        'base64',
      );
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    // 3. Create tree
    const tree = await this.createTree(input.owner, input.repo, treeEntries, parentSha);

    // 4. Create commit
    const commit = await this.createCommit(
      input.owner,
      input.repo,
      input.message,
      tree.sha,
      [parentSha],
    );

    // 5. Update ref
    await this.updateRef(input.owner, input.repo, input.branch, commit.sha);

    return { commitSha: commit.sha };
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
