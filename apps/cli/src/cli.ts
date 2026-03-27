import { Command } from 'commander';

import { createCliApp } from './app.js';

export function createProgram(): Command {
  const program = new Command();
  let app: ReturnType<typeof createCliApp> | undefined;
  const getApp = (): ReturnType<typeof createCliApp> => {
    app ??= createCliApp();
    return app;
  };

  program
    .name('devassemble')
    .description('AI-assisted SaaS stack assembler.')
    .version('0.1.0')
    .showHelpAfterError();

  program
    .command('init')
    .argument('<prompt>', 'Natural-language application brief')
    .description('Parse a prompt into a typed application plan.')
    .action(async (prompt: string) => {
      const runPlan = await getApp().init(prompt);
      console.log(`Created run ${runPlan.id} with ${runPlan.tasks.length} tasks.`);
      console.log(`Status: ${runPlan.status}`);
    });

  program
    .command('execute')
    .argument('[runId]', 'Run ID to execute')
    .description('Execute an approved run plan or the latest run.')
    .action(async (runId?: string) => {
      const runPlan = await getApp().execute(runId);
      console.log(`Run ${runPlan.id}: ${runPlan.status}`);
      for (const task of runPlan.tasks) {
        console.log(`${task.id} ${task.status}`);
      }
    });

  program
    .command('status')
    .argument('[runId]', 'Run ID to inspect')
    .description('Show the current run status.')
    .action(async (runId?: string) => {
      const runPlan = await getApp().status(runId);
      console.log(`Run ${runPlan.id}: ${runPlan.status}`);
      for (const task of runPlan.tasks) {
        console.log(`${task.id} ${task.status}`);
      }
    });

  program
    .command('resume')
    .argument('<runId>', 'Run ID to resume')
    .description('Resume a failed or paused run from checkpoint.')
    .action(async (runId: string) => {
      const runPlan = await getApp().resume(runId);
      console.log(`Run ${runPlan.id}: ${runPlan.status}`);
    });

  program
    .command('rollback')
    .argument('<runId>', 'Run ID to rollback')
    .description('Rollback a completed or partially completed run.')
    .action(async (runId: string) => {
      const runPlan = await getApp().rollback(runId);
      console.log(`Run ${runPlan.id}: ${runPlan.status}`);
    });

  const creds = program.command('creds').description('Manage provider credentials.');
  creds
    .command('add')
    .argument('<provider>', 'Provider name')
    .argument('<secret>', 'Token or API key')
    .description('Store a provider credential in the local state store.')
    .action(async (provider: string, secret: string) => {
      await getApp().addCredential(provider, secret);
      console.log(`Stored credential for ${provider}.`);
    });

  creds
    .command('list')
    .description('List providers with configured credentials.')
    .action(async () => {
      const providers = await getApp().listCredentials();
      if (providers.length === 0) {
        console.log('No provider credentials configured.');
        return;
      }

      for (const provider of providers) {
        console.log(provider);
      }
    });

  return program;
}
