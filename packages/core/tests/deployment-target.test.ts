import type { DeployIntent, DeploymentTarget } from '@assembler/types';
import { describe, expect, it } from 'vitest';

import {
  createDefaultDeploymentTargetRegistry,
  createDeploymentTargetRegistry,
  createRunPlanFromProjectScan,
} from '../src/index.js';

const nextjsIntent: DeployIntent = {
  artifact: 'ssr-node',
  framework: 'nextjs',
  envVarKeys: [],
};

const staticIntent: DeployIntent = {
  artifact: 'static',
  framework: 'astro',
  outputDirectory: 'dist',
  envVarKeys: [],
};

const unsupportedIntent: DeployIntent = {
  artifact: 'docker',
  framework: 'node',
  envVarKeys: [],
};

describe('deployment target registry', () => {
  it('selects the first registered target that supports the deploy intent', () => {
    const registry = createDeploymentTargetRegistry([
      target('unsupported', false),
      target('supported', true),
    ]);

    expect(registry.selectFor(nextjsIntent)?.name).toBe('supported');
  });

  it('uses an explicit target preference when it can satisfy the intent', () => {
    const registry = createDeploymentTargetRegistry([
      target('vercel', true),
      target('cloudflare-pages', true),
    ]);

    expect(registry.selectFor(staticIntent, 'cloudflare-pages')?.name).toBe(
      'cloudflare-pages',
    );
  });

  it('does not silently fall back when an explicit preference cannot satisfy the intent', () => {
    const registry = createDeploymentTargetRegistry([
      target('vercel', true),
      target('docker', false),
    ]);

    expect(registry.selectFor(nextjsIntent, 'docker')).toBeUndefined();
  });

  it('pre-registers Vercel in the default deployment target registry', () => {
    const registry = createDefaultDeploymentTargetRegistry();

    expect(registry.selectFor(nextjsIntent)?.name).toBe('vercel');
    expect(registry.selectFor(unsupportedIntent)).toBeUndefined();
  });

  it('lets framework strategies delegate deploy planning to the preferred target', () => {
    const registry = createDeploymentTargetRegistry([
      target('vercel', true),
      target('custom-static', true),
    ]);

    const plan = createRunPlanFromProjectScan(
      {
        name: 'deployment-target-app',
        framework: 'nextjs',
        directory: '/tmp/deployment-target-app',
        hasGitRemote: false,
        detectedProviders: [],
        requiredEnvVars: [],
        packageJson: {
          name: 'deployment-target-app',
        },
        lockfileCheck: {
          packageManager: 'pnpm',
          lockfileExists: true,
          inSync: true,
          missingFromLockfile: [],
          extraInLockfile: [],
        },
      },
      {
        deploymentTargetRegistry: registry,
        deploymentTargetPreference: 'custom-static',
      },
    );

    expect(plan.tasks.map((task) => task.id)).toContain('custom-static-deploy');
  });
});

function target(name: string, supportsIntent: boolean): DeploymentTarget {
  return {
    name,
    providerName: name,
    supports: () => supportsIntent,
    plan: (intent, ctx) => [
      {
        id: `${name}-deploy`,
        name: `Deploy to ${name}`,
        provider: name,
        action: 'deploy',
        params: {
          artifact: intent.artifact,
          framework: intent.framework,
        },
        dependsOn: [ctx.repoTaskId],
      },
    ],
  };
}
