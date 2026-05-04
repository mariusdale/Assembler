import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { DeployIntent } from '@assembler/types';

import type { FrameworkStrategy } from '../framework-strategy.js';

const STATIC_OUTPUT_DIRECTORIES = ['dist', 'build', '_site', 'out'] as const;

export const staticStrategy: FrameworkStrategy = {
  framework: 'static',
  matches(scan) {
    return scan.framework === 'static';
  },
  plan(ctx) {
    const buildCommand = getBuildCommand(ctx.projectScan.packageJson);
    const outputDirectory = detectStaticOutputDirectory(ctx.projectScan.directory, buildCommand);
    const intent: DeployIntent = {
      artifact: 'static',
      framework: 'static',
      envVarKeys: ctx.projectScan.requiredEnvVars.map((envVar) => envVar.name),
      ...(buildCommand ? { buildCommand } : {}),
      ...(outputDirectory ? { outputDirectory } : {}),
    };
    const target = ctx.deploymentTargets.selectFor(intent, ctx.deploymentTargetPreference);

    if (!target) {
      throw new Error(`No deployment target supports ${intent.framework} ${intent.artifact} apps.`);
    }

    return target.plan(intent, ctx);
  },
};

function detectStaticOutputDirectory(
  directory: string,
  buildCommand: string | undefined,
): string | undefined {
  for (const outputDirectory of STATIC_OUTPUT_DIRECTORIES) {
    if (existsSync(join(directory, outputDirectory, 'index.html'))) {
      return outputDirectory;
    }
  }

  if (buildCommand) {
    return 'dist';
  }

  if (existsSync(join(directory, 'index.html'))) {
    return '.';
  }

  return undefined;
}

function getBuildCommand(packageJson: Record<string, unknown>): string | undefined {
  const scripts = packageJson.scripts;
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
    return undefined;
  }

  const buildScript = (scripts as Record<string, unknown>).build;
  return typeof buildScript === 'string' && buildScript.trim() !== '' ? buildScript : undefined;
}
