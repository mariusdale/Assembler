import { describe, expect, it } from 'vitest';

import { createProgram } from '../src/cli.js';

describe('devassemble CLI', () => {
  it('exposes help text for the bootstrap command set', () => {
    const help = createProgram().helpInformation();

    expect(help).toContain('devassemble');
    expect(help).toContain('init');
    expect(help).toContain('execute');
    expect(help).toContain('creds');
    expect(help).toContain('Parse a prompt into a typed application plan.');
  });
});
