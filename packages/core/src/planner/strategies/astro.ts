import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DeployIntent } from '@assembler/types';

import type { FrameworkStrategy } from '../framework-strategy.js';

const ASTRO_CONFIG_FILENAMES = [
  'astro.config.ts',
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
] as const;

export const astroStrategy: FrameworkStrategy = {
  framework: 'astro',
  matches(scan) {
    return scan.framework === 'astro';
  },
  plan(ctx) {
    const buildCommand = getBuildCommand(ctx.projectScan.packageJson);
    const intent: DeployIntent = {
      artifact: detectAstroOutputMode(ctx.projectScan.directory) === 'server' ? 'ssr-node' : 'static',
      framework: 'astro',
      outputDirectory: 'dist',
      envVarKeys: ctx.projectScan.requiredEnvVars.map((envVar) => envVar.name),
      ...(buildCommand ? { buildCommand } : {}),
    };
    const target = ctx.deploymentTargets.selectFor(intent, ctx.deploymentTargetPreference);

    if (!target) {
      throw new Error(`No deployment target supports ${intent.framework} ${intent.artifact} apps.`);
    }

    return target.plan(intent, ctx);
  },
};

function detectAstroOutputMode(directory: string): 'server' | 'static' {
  for (const filename of ASTRO_CONFIG_FILENAMES) {
    const path = join(directory, filename);
    if (!existsSync(path)) {
      continue;
    }

    const config = readFileSync(path, 'utf8');
    if (/\boutput\s*:\s*['"]server['"]/.test(config)) {
      return 'server';
    }
  }

  return 'static';
}

function getBuildCommand(packageJson: Record<string, unknown>): string | undefined {
  const scripts = packageJson.scripts;
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
    return undefined;
  }

  const buildScript = (scripts as Record<string, unknown>).build;
  return typeof buildScript === 'string' && buildScript.trim() !== '' ? buildScript : undefined;
}
