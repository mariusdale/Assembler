import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { SqliteRunStateStore } from '@assembler/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createCliApp } from '../src/app.js';

const tempDirectories: string[] = [];

describe('cli app', () => {
  afterEach(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();
      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('stores structured provider credentials in the local state store', async () => {
    const cwd = createTempDirectory();
    const app = createCliApp(cwd);

    await app.addCredential('vercel', [
      'token=vercel_test_token',
      'teamId=team_123',
      'slug=assembler-team',
    ]);

    const store = new SqliteRunStateStore({
      filename: resolve(cwd, '.assembler', 'state.db'),
    });
    store.initialize();

    const record = store.getCredentialRecord('vercel');

    expect(record?.reference).toBe('vercel_test_token');
    expect(record?.metadata).toMatchObject({
      teamId: 'team_123',
      slug: 'assembler-team',
    });
  });

  it('fails execute early when required live provider credentials are missing', async () => {
    const cwd = createTempDirectory();
    const app = createCliApp(cwd);
    const runPlan = await app.init('build menugen with subscriptions');

    await expect(app.execute(runPlan.id)).rejects.toThrow(
      'Missing required live credentials for:',
    );
  });
});

function createTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'assembler-cli-'));
  tempDirectories.push(directory);
  return directory;
}
