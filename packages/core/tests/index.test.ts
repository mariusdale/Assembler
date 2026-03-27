import { describe, expect, it } from 'vitest';

import { SqliteRunStateStore } from '../src/index.js';

describe('core exports', () => {
  it('constructs a state store export', () => {
    const store = new SqliteRunStateStore();

    expect(store).toBeInstanceOf(SqliteRunStateStore);
    store.close();
  });
});

