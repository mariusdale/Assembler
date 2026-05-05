import { describe, expect, it } from 'vitest';

import { createProgram } from '../src/cli.js';

describe('assembler CLI', () => {
  it('shows the curated public command surface in help output', () => {
    const help = createProgram().helpInformation();

    expect(help).toContain('assembler');
    expect(help).toContain('launch');
    expect(help).toContain('doctor');
    expect(help).toContain('status');
    expect(help).toContain('creds');
    expect(help).toContain('init');
    expect(help).toContain('config');
    expect(help).toContain('Legacy shortcut for guided credential setup.');
    expect(help).not.toContain('Parse a prompt into a typed application plan.');
    expect(help).not.toContain('Execute an approved run plan or the latest run.');
    expect(help).not.toContain('Show persisted run events for a run.');
    expect(help).not.toContain('Validate stored credentials against a provider account.');
  });

  it('exposes deployment target preference on plan and launch', () => {
    const program = createProgram();
    const planHelp = program.commands.find((command) => command.name() === 'plan')?.helpInformation();
    const launchHelp = program.commands
      .find((command) => command.name() === 'launch')
      ?.helpInformation();

    expect(planHelp).toContain('--target <target>');
    expect(launchHelp).toContain('--target <target>');
  });

  it('exposes config show as a project configuration command', () => {
    const config = createProgram().commands.find((command) => command.name() === 'config');

    expect(config?.commands.map((command) => command.name())).toContain('show');
  });
});
