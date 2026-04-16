import { describe, expect, it } from 'vitest';

import { createProgram } from '../src/cli.js';

describe('devassemble CLI', () => {
  it('shows the curated public command surface in help output', () => {
    const help = createProgram().helpInformation();

    expect(help).toContain('devassemble');
    expect(help).toContain('launch');
    expect(help).toContain('doctor');
    expect(help).toContain('status');
    expect(help).toContain('creds');
    expect(help).toContain('Legacy shortcut for guided credential setup.');
    expect(help).not.toContain('Parse a prompt into a typed application plan.');
    expect(help).not.toContain('Execute an approved run plan or the latest run.');
    expect(help).not.toContain('Show persisted run events for a run.');
    expect(help).not.toContain('Validate stored credentials against a provider account.');
  });
});
