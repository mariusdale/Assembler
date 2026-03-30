#!/usr/bin/env node

const args = process.argv.slice(2);
const hasSubcommand = args.length > 0 && !args[0]?.startsWith('-');

if (hasSubcommand || !process.stdin.isTTY) {
  const { createProgram } = await import('./cli.js');
  await createProgram().parseAsync(process.argv);
} else {
  const { startTui } = await import('./tui/app.js');
  await startTui();
}
