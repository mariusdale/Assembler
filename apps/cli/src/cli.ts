import { createInterface } from 'node:readline';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import type { ProjectScan, RunPlan, Task } from '@devassemble/types';

import { createCliApp } from './app.js';
import type { PreflightCheckResults, EnvPullResult, EnvPushResult, DomainAddResult, PreviewResult, PreviewTeardownResult, DoctorResult } from './app.js';

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
  cloudflare: 'DNS: Cloudflare',
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
    .description('Launch and operate your existing Next.js application from the terminal.')
    .version('0.1.0')
    .showHelpAfterError()
    .addHelpText(
      'after',
      '\nPrimary workflow: run `devassemble` for the TUI, then use Credentials, Doctor, Launch, and Status to manage the project lifecycle.\n',
    );

  program
    .command('launch')
    .description('Scan the current project, plan infrastructure, and execute the run.')
    .action(async () => {
      const cliApp = getApp();

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

      const lc = projectScan.lockfileCheck;
      if (!lc.lockfileExists) {
        console.log();
        console.log(chalk.red('✗ No lockfile found (package-lock.json, pnpm-lock.yaml, or yarn.lock).'));
        console.log(chalk.dim('  → Run your package manager\'s install command to generate one, then commit it.'));
        console.log(chalk.dim('  → Vercel and other CI hosts require a lockfile to build your project.'));
        process.exitCode = 1;
        return;
      }
      if (!lc.inSync) {
        console.log();
        console.log(chalk.red(`✗ ${lc.packageManager ?? 'Package'} lockfile is out of sync with package.json.`));
        if (lc.missingFromLockfile.length > 0) {
          console.log(chalk.dim(`  Added in package.json but missing from lockfile: ${lc.missingFromLockfile.join(', ')}`));
        }
        if (lc.extraInLockfile.length > 0) {
          console.log(chalk.dim(`  In lockfile but removed from package.json: ${lc.extraInLockfile.join(', ')}`));
        }
        const installCmd = lc.packageManager === 'pnpm' ? 'pnpm install' : lc.packageManager === 'yarn' ? 'yarn install' : 'npm install';
        console.log(chalk.dim(`  → Run "${installCmd}" and commit the updated lockfile.`));
        console.log(chalk.dim('  → Vercel builds with --frozen-lockfile and will reject mismatched lockfiles.'));
        process.exitCode = 1;
        return;
      }

      const runPlan = cliApp.createPlan(projectScan);

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

      console.log();
      printExecutionPlan(runPlan);

      const confirmed = await promptConfirm('Proceed?');
      if (!confirmed) {
        console.log(chalk.dim('Aborted.'));
        return;
      }

      console.log();
      let finalPlan: RunPlan;
      try {
        finalPlan = await executeWithSpinners(cliApp, runPlan);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }

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
    .description('Legacy shortcut for guided credential setup.')
    .action(async () => {
      const cliApp = getApp();

      console.log();
      console.log(chalk.bold('Welcome to DevAssemble!') + " Let's set up your provider credentials.");
      console.log(chalk.dim('This shortcut remains available for CLI-first onboarding. The Credentials screen is the primary path in the TUI.'));
      console.log();

      const steps = [
        {
          provider: 'github',
          label: 'GitHub',
          description: 'DevAssemble needs a GitHub Personal Access Token with the `repo` scope.',
          url: 'https://github.com/settings/tokens/new?scopes=repo&description=DevAssemble',
          entries: (token: string) => [token],
        },
        {
          provider: 'neon',
          label: 'Neon',
          description: 'DevAssemble needs an account-level Neon API key (not project-scoped).',
          url: 'https://console.neon.tech/app/settings/api-keys',
          entries: (token: string) => [token],
        },
        {
          provider: 'vercel',
          label: 'Vercel',
          description: 'DevAssemble needs a Vercel API token.',
          url: 'https://vercel.com/account/tokens',
          entries: (token: string) => [`token=${token}`],
        },
      ];

      let stepNumber = 0;
      for (const step of steps) {
        stepNumber += 1;
        console.log(chalk.bold(`Step ${stepNumber}/${steps.length}: ${step.label}`));
        console.log(`  ${step.description}`);

        const existingProviders = await cliApp.listCredentials();
        if (existingProviders.includes(step.provider)) {
          const validateSpinner = ora(`  Checking existing ${step.label} credential...`).start();
          try {
            const discovery = await cliApp.discover(step.provider);
            if (discovery.connected) {
              validateSpinner.succeed(`  ${step.label}: existing credential is valid${discovery.accountName ? ` (${discovery.accountName})` : ''}`);
              const replace = await promptConfirm(`  Replace existing ${step.label} credential?`);
              if (!replace) {
                console.log();
                continue;
              }
            } else {
              validateSpinner.warn(`  ${step.label}: existing credential is invalid`);
            }
          } catch {
            validateSpinner.warn(`  ${step.label}: existing credential could not be validated`);
          }
        }

        console.log(`  ${chalk.dim('→')} ${step.url}`);
        tryOpenUrl(step.url);

        const token = await promptSecret(`  Paste your ${step.label === 'Neon' ? 'API key' : 'token'}: `);
        if (!token) {
          console.log(chalk.yellow(`  Skipped ${step.label}. You can add it later with "devassemble creds add ${step.provider} <token>".`));
          console.log();
          continue;
        }

        await cliApp.addCredential(step.provider, step.entries(token));

        const spinner = ora('  Validating...').start();
        try {
          const discovery = await cliApp.discover(step.provider);
          if (discovery.connected) {
            spinner.succeed(`  ${step.label}: valid${discovery.accountName ? ` (${discovery.accountName})` : ''}`);
          } else {
            spinner.fail(`  ${step.label}: credential was rejected`);
            console.log(chalk.yellow(`  You can update it later with "devassemble creds add ${step.provider} <token>".`));
          }
        } catch (error) {
          spinner.fail(`  ${step.label}: validation failed`);
          printError(error);
        }

        if (step.provider === 'vercel') {
          console.log();
          console.log(chalk.yellow('  Note: The Vercel GitHub App must be installed for repo linking.'));
          console.log(`  ${chalk.dim('→')} https://github.com/apps/vercel`);
        }

        console.log();
      }

      console.log(chalk.green('Setup complete!') + ' Run ' + chalk.cyan('devassemble launch') + ' from any project directory to deploy.');
    });

  program
    .command('plan')
    .description('Scan the project and show the execution plan without running it.')
    .action(async () => {
      const cliApp = getApp();

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

      const runPlan = cliApp.createPlan(projectScan);

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

      console.log();
      printExecutionPlan(runPlan);

      console.log();
      console.log(chalk.dim(`Run ID: ${runPlan.id}`));
      console.log(chalk.dim('Run "devassemble launch" to execute this plan.'));
    });

  program
    .command('init', { hidden: true })
    .argument('<prompt>', 'Natural-language application brief')
    .description('Parse a prompt into a typed application plan.')
    .action(async (prompt: string) => {
      const runPlan = await getApp().init(prompt);
      console.log(`Created run ${runPlan.id} with ${runPlan.tasks.length} tasks.`);
      console.log(`Status: ${runPlan.status}`);
    });

  program
    .command('execute', { hidden: true })
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
    .description('Show deployment history or inspect a specific run.')
    .action(async (runId?: string) => {
      const runPlan = await getApp().status(runId);
      console.log(`Run ${runPlan.id}: ${runPlan.status}`);
      for (const task of runPlan.tasks) {
        console.log(`${task.id} ${task.status}`);
      }
    });

  program
    .command('events', { hidden: true })
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
    .command('rollback', { hidden: true })
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

      console.log();
      const spinner = ora('Tearing down resources...').start();
      try {
        const result = await cliApp.rollback(runPlan.id);
        spinner.stop();

        for (const task of result.tasks) {
          if (task.status === 'rolled_back') {
            console.log(`  ${chalk.green('✓')} ${task.name} — removed`);
          } else if (task.status === 'success') {
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

  program
    .command('preview')
    .argument('[branch]', 'Git branch to deploy (defaults to current branch)')
    .description('Create a preview environment with a database branch and Vercel deployment.')
    .action(async (branch?: string) => {
      const cliApp = getApp();
      const spinner = ora('Creating preview environment...').start();
      try {
        const result: PreviewResult = await cliApp.preview(branch);
        spinner.succeed('Preview environment created');
        console.log();
        console.log(chalk.bold('Preview Environment'));
        console.log(`  Branch:      ${chalk.cyan(result.branchName)}`);
        if (result.previewUrl) {
          console.log(`  Preview URL: ${chalk.cyan(result.previewUrl)}`);
        }
        if (result.neonBranchId) {
          console.log(`  Database:    ${chalk.dim('Branch DB connected via Vercel env vars')}`);
        }
        console.log();
        console.log(chalk.dim('Run "devassemble preview-teardown" to clean up.'));
      } catch (error) {
        spinner.fail('Preview creation failed');
        printError(error);
        process.exitCode = 1;
      }
    });

  program
    .command('preview-teardown')
    .argument('[branch]', 'Git branch to tear down (defaults to current branch)')
    .description('Delete the preview environment for a branch.')
    .action(async (branch?: string) => {
      const cliApp = getApp();
      const spinner = ora('Tearing down preview environment...').start();
      try {
        const result: PreviewTeardownResult = await cliApp.previewTeardown(branch);
        spinner.succeed(`Preview for "${result.branchName}" torn down`);
        if (result.deletedBranch) {
          console.log(`  ${chalk.green('✓')} Neon database branch deleted`);
        }
      } catch (error) {
        spinner.fail('Preview teardown failed');
        printError(error);
        process.exitCode = 1;
      }
    });

  const domain = program.command('domain').description('Manage custom domains.');
  domain
    .command('add')
    .argument('<domain>', 'Custom domain to configure (e.g., app.example.com)')
    .description('Configure a custom domain with Cloudflare DNS and Vercel.')
    .action(async (domainArg: string) => {
      const cliApp = getApp();
      const spinner = ora(`Configuring domain "${domainArg}"...`).start();
      try {
        const result: DomainAddResult = await cliApp.domainAdd(domainArg);
        spinner.succeed(`Domain "${domainArg}" configured`);
        console.log();
        if (result.dnsRecordCreated) {
          console.log(`  ${chalk.green('✓')} DNS record created (CNAME → cname.vercel-dns.com)`);
        }
        if (result.vercelDomainAdded) {
          console.log(`  ${chalk.green('✓')} Domain added to Vercel project`);
        }
        if (result.verified) {
          console.log(`  ${chalk.green('✓')} DNS verified`);
        } else {
          console.log(`  ${chalk.yellow('○')} DNS not yet verified — propagation may take a few minutes`);
        }
        console.log();
        console.log(chalk.dim('SSL will be provisioned automatically by Vercel once DNS propagates.'));
      } catch (error) {
        spinner.fail('Domain configuration failed');
        printError(error);
        process.exitCode = 1;
      }
    });

  const creds = program.command('creds').description('Manage provider credentials for launch workflows.');
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
    .command('doctor')
    .description('Check project readiness and validate configured provider credentials.')
    .action(async () => {
      const spinner = ora('Running diagnostics...').start();
      let result: DoctorResult;
      try {
        result = await getApp().doctor();
        spinner.stop();
      } catch (error) {
        spinner.fail('Doctor check failed');
        printError(error);
        process.exitCode = 1;
        return;
      }

      console.log(chalk.bold('DevAssemble Doctor'));
      console.log();
      console.log(`  Node.js: ${chalk.green(result.nodeVersion)}`);
      console.log();
      console.log(chalk.bold('Provider Credentials:'));

      for (const check of result.checks) {
        const label = PROVIDER_LABELS[check.provider] ?? check.provider;

        if (!check.hasCredentials) {
          console.log(`  ${chalk.dim('○')} ${chalk.dim(label)} ${chalk.dim('— not configured')}`);
          continue;
        }

        if (check.preflightResult?.valid) {
          console.log(`  ${chalk.green('✓')} ${label}`);
        } else {
          console.log(`  ${chalk.red('✗')} ${label}`);
          for (const err of check.preflightResult?.errors ?? []) {
            console.log(`    ${chalk.red(err.message)}`);
            if (err.remediation) {
              console.log(`    ${chalk.dim(err.remediation)}`);
            }
          }
        }
      }

      console.log();
      if (result.allHealthy) {
        console.log(chalk.green('All configured providers are healthy.'));
      } else {
        console.log(chalk.yellow('Some providers have issues. Fix them before running "devassemble launch".'));
        process.exitCode = 1;
      }
    });

  program
    .command('discover', { hidden: true })
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

  for (const task of runPlan.tasks) {
    const spinner = ora({ text: chalk.dim(task.name), prefixText: '  ' }).stop();
    taskSpinners.set(task.id, spinner);
  }

  const resultPromise = cliApp.executePlan(runPlan);
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
  const runLine = `   Run ID:   ${plan.id}`;
  console.log(`│${runLine}${' '.repeat(Math.max(0, 56 - runLine.length))}│`);
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

  if (previewUrl) {
    console.log();
    console.log(chalk.yellow('Note: Vercel preview deployments are protected by default.'));
    console.log(chalk.yellow('The preview URL may return 401 for unauthenticated visitors.'));
    console.log(chalk.dim('To disable: Vercel Dashboard → Project Settings → Deployment Protection'));
  }

  console.log();
  console.log(chalk.dim(`Recommended next command: devassemble teardown`));
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

function tryOpenUrl(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  import('node:child_process').then(({ execFile }) => {
    execFile(command, [url], () => {
      // Silent failure — URL is already printed for manual copy
    });
  }).catch(() => {});
}

async function promptSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return '';
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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
