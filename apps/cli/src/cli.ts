import { createInterface } from 'node:readline';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import type { ProjectScan, RunPlan, Task } from '@devassemble/types';

import { createCliApp } from './app.js';
import type { PreflightCheckResults, EnvPullResult, EnvPushResult, SetupResult } from './app.js';

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js',
  remix: 'Remix',
  astro: 'Astro',
  node: 'Node.js',
  unknown: 'Unknown',
};

const PROVIDER_LABELS: Record<string, string> = {
  neon: 'Database: Neon',
  vercel: 'Hosting: Vercel',
  clerk: 'Auth: Clerk',
  stripe: 'Payments: Stripe',
  resend: 'Email: Resend',
  sentry: 'Error Tracking: Sentry',
  posthog: 'Analytics: PostHog',
};

export function createProgram(): Command {
  const program = new Command();
  let app: ReturnType<typeof createCliApp> | undefined;
  const getApp = (): ReturnType<typeof createCliApp> => {
    app ??= createCliApp();
    return app;
  };

  program
    .name('devassemble')
    .description('Scan, provision, and deploy your project — no dashboards required.')
    .version('0.1.0')
    .showHelpAfterError();

  program
    .command('launch')
    .description('Scan the current project, plan infrastructure, and execute the run.')
    .action(async () => {
      const cliApp = getApp();

      // Phase 1: Scan
      const scanSpinner = ora('Scanning project...').start();
      let projectScan: ProjectScan;
      try {
        projectScan = await cliApp.scan();
        const frameworkLabel = FRAMEWORK_LABELS[projectScan.framework] ?? projectScan.framework;
        scanSpinner.succeed(`${frameworkLabel} app detected`);
      } catch (error) {
        scanSpinner.fail('Project scan failed');
        printError(error);
        process.exitCode = 1;
        return;
      }

      // Show detected services
      printDetectedServices(projectScan);

      // Phase 2: Create plan
      const runPlan = cliApp.createPlan(projectScan);

      // Phase 3: Preflight
      console.log();
      console.log(chalk.bold('Checking credentials...'));
      let preflightResults: PreflightCheckResults;
      try {
        preflightResults = await cliApp.preflight(runPlan);
        for (const [provider, result] of preflightResults.results) {
          if (result.valid) {
            console.log(`  ${chalk.green('✓')} ${capitalise(provider)}: valid`);
          } else {
            console.log(`  ${chalk.red('✗')} ${capitalise(provider)}: failed`);
            for (const err of result.errors) {
              console.log(`    ${chalk.red(err.message)}`);
              console.log(`    ${chalk.dim('→')} ${err.remediation}`);
              if (err.url) {
                console.log(`      ${chalk.dim(err.url)}`);
              }
            }
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }

      if (!preflightResults.allValid) {
        console.log();
        console.log(chalk.red('Preflight checks failed. Fix the issues above and retry.'));
        process.exitCode = 1;
        return;
      }

      // Phase 4: Show plan
      console.log();
      printExecutionPlan(runPlan);

      // Prompt for confirmation
      const confirmed = await promptConfirm('Proceed?');
      if (!confirmed) {
        console.log(chalk.dim('Aborted.'));
        return;
      }

      // Phase 5: Execute
      console.log();
      let finalPlan: RunPlan;
      try {
        finalPlan = await executeWithSpinners(cliApp, runPlan);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }

      // Phase 6: Summary
      const failed = finalPlan.tasks.filter((t) => t.status === 'failed');
      if (failed.length > 0) {
        console.log();
        console.log(chalk.red(`Run failed. ${failed.length} task(s) did not complete:`));
        for (const task of failed) {
          console.log(`  ${chalk.red('✗')} ${task.name}`);
          if (task.error) {
            console.log(`    ${chalk.dim(task.error)}`);
          }
          if (task.remediationHint) {
            console.log(`    ${chalk.dim('→')} ${task.remediationHint}`);
          }
        }
        process.exitCode = 1;
        return;
      }

      printCompletionSummary(projectScan, finalPlan);
    });

  program
    .command('setup')
    .description('Set up a local dev environment for an already-launched project.')
    .action(async () => {
      const cliApp = getApp();

      // Phase 1: Scan
      const scanSpinner = ora('Scanning project...').start();
      let result: SetupResult;
      try {
        scanSpinner.text = 'Scanning project and finding Vercel project...';
        result = await cliApp.setup();
        scanSpinner.succeed('Local environment configured');
      } catch (error) {
        scanSpinner.fail('Setup failed');
        printError(error);
        process.exitCode = 1;
        return;
      }

      // Show what happened
      const frameworkLabel = FRAMEWORK_LABELS[result.projectScan.framework] ?? result.projectScan.framework;
      console.log();
      console.log(chalk.bold('Setup complete:'));
      console.log(`  ${chalk.green('✓')} ${frameworkLabel} project detected`);
      console.log(`  ${chalk.green('✓')} Vercel project: ${chalk.cyan(result.vercelProjectName)}`);
      console.log(`  ${chalk.green('✓')} ${result.envVarCount} env var(s) written to ${chalk.dim('.env.local')}`);

      if (result.missingCredentials.length > 0) {
        console.log();
        console.log(chalk.yellow('Missing provider credentials (not required for local dev):'));
        for (const provider of result.missingCredentials) {
          console.log(`  ${chalk.yellow('!')} ${capitalise(provider)}: run ${chalk.dim(`devassemble creds add ${provider} <token>`)}`);
        }
      }

      console.log();
      console.log(chalk.dim('You can now run your dev server. Env vars are in .env.local.'));
    });

  program
    .command('plan')
    .description('Scan the project and show the execution plan without running it.')
    .action(async () => {
      const cliApp = getApp();

      // Scan
      const scanSpinner = ora('Scanning project...').start();
      let projectScan: ProjectScan;
      try {
        projectScan = await cliApp.scan();
        const frameworkLabel = FRAMEWORK_LABELS[projectScan.framework] ?? projectScan.framework;
        scanSpinner.succeed(`${frameworkLabel} app detected`);
      } catch (error) {
        scanSpinner.fail('Project scan failed');
        printError(error);
        process.exitCode = 1;
        return;
      }

      printDetectedServices(projectScan);

      // Create plan (saved to state store but not executed)
      const runPlan = cliApp.createPlan(projectScan);

      // Preflight
      console.log();
      console.log(chalk.bold('Checking credentials...'));
      try {
        const preflightResults = await cliApp.preflight(runPlan);
        for (const [provider, result] of preflightResults.results) {
          if (result.valid) {
            console.log(`  ${chalk.green('✓')} ${capitalise(provider)}: valid`);
          } else {
            console.log(`  ${chalk.red('✗')} ${capitalise(provider)}: failed`);
            for (const err of result.errors) {
              console.log(`    ${chalk.red(err.message)}`);
              console.log(`    ${chalk.dim('→')} ${err.remediation}`);
            }
          }
        }

        if (!preflightResults.allValid) {
          console.log();
          console.log(chalk.red('Preflight checks failed. Fix the issues above and retry.'));
          process.exitCode = 1;
          return;
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }

      // Show plan
      console.log();
      printExecutionPlan(runPlan);

      console.log();
      console.log(chalk.dim(`Run ID: ${runPlan.id}`));
      console.log(chalk.dim('Run "devassemble launch" to execute this plan.'));
    });

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
    .command('events')
    .argument('[runId]', 'Run ID to inspect')
    .description('Show persisted run events for a run.')
    .action(async (runId?: string) => {
      const events = await getApp().events(runId);
      if (events.length === 0) {
        console.log('No events recorded for this run.');
        return;
      }

      for (const event of events) {
        const taskLabel = event.taskId ? ` ${event.taskId}` : '';
        console.log(
          `${event.timestamp.toISOString()} ${event.level} ${event.type}${taskLabel} ${event.message}`,
        );
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

  program
    .command('teardown')
    .argument('[runId]', 'Run ID to tear down (defaults to the latest run)')
    .description('Delete all resources created by a launch run.')
    .action(async (runId?: string) => {
      const cliApp = getApp();

      // Load the run
      let runPlan: RunPlan;
      try {
        runPlan = await cliApp.status(runId);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }

      if (runPlan.status === 'rolled_back') {
        console.log(chalk.yellow('This run has already been torn down.'));
        return;
      }

      if (runPlan.status === 'draft') {
        console.log(chalk.yellow('This run was never executed — nothing to tear down.'));
        return;
      }

      const successfulTasks = runPlan.tasks.filter((t) => t.status === 'success');
      if (successfulTasks.length === 0) {
        console.log(chalk.yellow('No successfully completed tasks to tear down.'));
        return;
      }

      // Show what will be deleted
      console.log(chalk.bold('The following resources will be deleted:\n'));
      const teardownItems = describeTeardownActions(successfulTasks);
      for (const item of teardownItems) {
        console.log(`  ${chalk.red('✗')} ${item}`);
      }

      console.log();
      const confirmed = await promptConfirm('This is destructive and cannot be undone. Proceed?');
      if (!confirmed) {
        console.log(chalk.dim('Aborted.'));
        return;
      }

      // Execute rollback
      console.log();
      const spinner = ora('Tearing down resources...').start();
      try {
        const result = await cliApp.rollback(runPlan.id);
        spinner.stop();

        for (const task of result.tasks) {
          if (task.status === 'rolled_back') {
            console.log(`  ${chalk.green('✓')} ${task.name} — removed`);
          } else if (task.status === 'success') {
            // Tasks that don't have rollback actions (like capture-keys)
            console.log(`  ${chalk.dim('○')} ${task.name} — nothing to remove`);
          }
        }

        console.log();
        console.log(chalk.green('Teardown complete. All provisioned resources have been removed.'));
      } catch (error) {
        spinner.fail('Teardown failed');
        printError(error);
        process.exitCode = 1;
      }
    });

  const env = program.command('env').description('Sync environment variables with Vercel.');
  env
    .command('pull')
    .argument('[runId]', 'Run ID to pull env vars from (defaults to latest)')
    .description('Pull environment variables from Vercel into .env.local.')
    .action(async (runId?: string) => {
      const cliApp = getApp();
      const spinner = ora('Pulling environment variables from Vercel...').start();
      try {
        const result: EnvPullResult = await cliApp.envPull(runId);
        spinner.succeed(`Pulled ${Object.keys(result.variables).length} variable(s) from ${result.projectName}`);
        console.log();
        for (const key of Object.keys(result.variables).sort()) {
          console.log(`  ${chalk.green('✓')} ${key}`);
        }
        console.log();
        console.log(chalk.dim(`Written to ${result.filePath}`));
      } catch (error) {
        spinner.fail('Failed to pull environment variables');
        printError(error);
        process.exitCode = 1;
      }
    });

  env
    .command('push')
    .argument('[runId]', 'Run ID to push env vars to (defaults to latest)')
    .description('Push local .env.local or .env variables to Vercel.')
    .action(async (runId?: string) => {
      const cliApp = getApp();
      const spinner = ora('Pushing environment variables to Vercel...').start();
      try {
        const result: EnvPushResult = await cliApp.envPush(runId);
        spinner.succeed(`Pushed ${result.pushed.length} variable(s) to ${result.projectName}`);
        console.log();
        for (const key of result.pushed) {
          console.log(`  ${chalk.green('✓')} ${key}`);
        }
      } catch (error) {
        spinner.fail('Failed to push environment variables');
        printError(error);
        process.exitCode = 1;
      }
    });

  const creds = program.command('creds').description('Manage provider credentials.');
  creds
    .command('add')
    .argument('<provider>', 'Provider name')
    .argument('<entries...>', 'Credential entries, either <token> or key=value pairs')
    .description('Store a provider credential in the local state store.')
    .action(async (provider: string, entries: string[]) => {
      await getApp().addCredential(provider, entries);
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

  program
    .command('discover')
    .argument('<provider>', 'Provider name')
    .description('Validate stored credentials against a provider account.')
    .action(async (provider: string) => {
      const result = await getApp().discover(provider);
      console.log(`Provider: ${provider}`);
      console.log(`Connected: ${result.connected}`);
      if (result.accountName) {
        console.log(`Account: ${result.accountName}`);
      }
      if (result.accountId) {
        console.log(`Account ID: ${result.accountId}`);
      }
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    });

  return program;
}

function printDetectedServices(scan: ProjectScan): void {
  const providers = scan.detectedProviders.filter(
    (p) => p.provider !== 'github',
  );
  if (providers.length === 0) {
    return;
  }

  console.log();
  console.log(chalk.bold('Detected services:'));
  for (const provider of providers) {
    const label = PROVIDER_LABELS[provider.provider] ?? provider.provider;
    const evidence = provider.evidence[0] ? chalk.dim(`(${provider.evidence[0]})`) : '';
    console.log(`  ${chalk.cyan('•')} ${label} ${evidence}`);
  }
}

function printExecutionPlan(runPlan: RunPlan): void {
  console.log(chalk.bold('Execution Plan:'));
  runPlan.tasks.forEach((task, index) => {
    const label = task.requiresApproval ? 'approval' : 'auto';
    const costHint = getCostHint(task);
    const suffix = costHint ? ` ${chalk.dim(`[${label} - ${costHint}]`)}` : ` ${chalk.dim(`[${label}]`)}`;
    console.log(`  ${chalk.dim(`${String(index + 1).padStart(2)}.`)} ${task.name}${suffix}`);
  });

  const cost = runPlan.estimatedCostUsd;
  console.log();
  console.log(
    `Estimated cost: ${chalk.green(`$${cost.toFixed(2)}`)}${cost === 0 ? ' (all free tier)' : ''}`,
  );
}

function getCostHint(task: Task): string | undefined {
  if (task.provider === 'neon' && task.action === 'create-project') return 'free tier';
  if (task.provider === 'vercel' && task.action === 'create-project') return 'free tier';
  return undefined;
}

async function executeWithSpinners(
  cliApp: ReturnType<typeof createCliApp>,
  runPlan: RunPlan,
): Promise<RunPlan> {
  const taskSpinners = new Map<string, ReturnType<typeof ora>>();

  // Start all task spinners in pending state
  for (const task of runPlan.tasks) {
    const spinner = ora({ text: chalk.dim(task.name), prefixText: '  ' }).stop();
    taskSpinners.set(task.id, spinner);
  }

  // Execute and poll for status changes
  const resultPromise = cliApp.executePlan(runPlan);

  // We can't easily hook into the executor's event stream from outside,
  // so we execute and then display results
  const result = await resultPromise;

  for (const task of result.tasks) {
    if (task.status === 'success') {
      console.log(`  ${chalk.green('✓')} ${task.name}`);
    } else if (task.status === 'failed') {
      console.log(`  ${chalk.red('✗')} ${task.name}`);
      if (task.error) {
        console.log(`    ${chalk.dim(task.error)}`);
      }
    } else if (task.status === 'skipped') {
      console.log(`  ${chalk.yellow('○')} ${task.name} ${chalk.dim('(skipped)')}`);
    } else {
      console.log(`  ${chalk.dim('?')} ${task.name} ${chalk.dim(`(${task.status})`)}`);
    }
  }

  return result;
}

function printCompletionSummary(scan: ProjectScan, plan: RunPlan): void {
  const previewUrl =
    getTaskOutput(plan, 'vercel-wait-for-ready', 'previewUrl') ??
    getTaskOutput(plan, 'vercel-deploy-preview', 'previewUrl');
  const repoUrl = getTaskOutput(plan, 'github-create-repo', 'repoUrl') ??
    getTaskOutput(plan, 'github-use-existing-repo', 'repoUrl');
  const hasNeon = plan.tasks.some((t) => t.provider === 'neon' && t.status === 'success');

  console.log();
  const border = chalk.green('─'.repeat(56));
  console.log(`┌${border}┐`);
  console.log(`│${' '.repeat(56)}│`);
  console.log(`│   ${chalk.green('✓')} ${chalk.bold(`${scan.name} is live!`)}${' '.repeat(Math.max(0, 46 - scan.name.length))}│`);
  console.log(`│${' '.repeat(56)}│`);
  if (previewUrl) {
    const line = `   Preview:  ${previewUrl}`;
    console.log(`│${line}${' '.repeat(Math.max(0, 56 - line.length))}│`);
  }
  if (repoUrl) {
    const line = `   Repo:     ${repoUrl}`;
    console.log(`│${line}${' '.repeat(Math.max(0, 56 - line.length))}│`);
  }
  const hasStripe = plan.tasks.some((t) => t.provider === 'stripe' && t.status === 'success');

  if (hasNeon) {
    const line = '   Database: Neon (connection string set in Vercel)';
    console.log(`│${line}${' '.repeat(Math.max(0, 56 - line.length))}│`);
  }
  if (hasStripe) {
    const mode = getTaskOutput(plan, 'stripe-capture-keys', 'mode') ?? 'unknown';
    const line = `   Stripe:   ${mode} mode keys synced to Vercel`;
    console.log(`│${line}${' '.repeat(Math.max(0, 56 - line.length))}│`);
  }
  console.log(`│${' '.repeat(56)}│`);
  console.log(`└${border}┘`);

  // Deployment Protection warning
  if (previewUrl) {
    console.log();
    console.log(chalk.yellow('Note: Vercel preview deployments are protected by default.'));
    console.log(chalk.yellow('The preview URL may return 401 for unauthenticated visitors.'));
    console.log(chalk.dim('To disable: Vercel Dashboard → Project Settings → Deployment Protection'));
  }

  // Teardown hint
  console.log();
  console.log(chalk.dim(`Run "devassemble teardown" to remove all created resources.`));
}

function describeTeardownActions(tasks: Task[]): string[] {
  const items: string[] = [];
  for (const task of tasks) {
    if (task.provider === 'github' && task.action === 'create-repo') {
      const repoName = task.outputs.repoFullName ?? task.outputs.repoName ?? task.params.name;
      items.push(`GitHub repository: ${repoName}`);
    } else if (task.provider === 'neon' && task.action === 'create-project') {
      const projectName = task.outputs.projectName ?? task.params.name;
      items.push(`Neon project: ${projectName}`);
    } else if (task.provider === 'vercel' && (task.action === 'create-project' || task.action === 'link-repository')) {
      if (task.action === 'create-project') {
        const projectName = task.outputs.projectName ?? task.params.name;
        items.push(`Vercel project: ${projectName}`);
      }
    }
  }
  if (items.length === 0) {
    items.push('No deletable resources found (only credential captures and deployments)');
  }
  return items;
}

function getTaskOutput(plan: RunPlan, taskId: string, key: string): string | undefined {
  const task = plan.tasks.find((t) => t.id === taskId);
  const value = task?.outputs[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function printError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
}

async function promptConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return true;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} ${chalk.dim('(y/n)')} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}
