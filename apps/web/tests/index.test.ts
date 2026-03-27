import { describe, expect, it } from 'vitest';

import { webAppPlaceholder } from '../src/index.js';

describe('web placeholder', () => {
  it('documents the future dashboard scope', () => {
    expect(webAppPlaceholder.name).toBe('devassemble-web');
    expect(webAppPlaceholder.message).toContain('later milestone');
  });
});

