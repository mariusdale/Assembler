import type { ProjectScan } from '@assembler/types';
import { describe, expect, it } from 'vitest';

import {
  createDefaultFrameworkRegistry,
  createFrameworkRegistry,
  createRunPlanFromProjectScan,
  nextjsStrategy,
} from '../src/index.js';

const baseProjectScan = {
  name: 'strategy-app',
  framework: 'unknown',
  directory: '/tmp/strategy-app',
  hasGitRemote: false,
  detectedProviders: [],
  requiredEnvVars: [],
  packageJson: {
    name: 'strategy-app',
  },
  lockfileCheck: {
    packageManager: 'pnpm',
    lockfileExists: true,
    inSync: true,
    missingFromLockfile: [],
    extraInLockfile: [],
  },
} satisfies ProjectScan;

describe('framework strategy registry', () => {
  it('resolves the first matching registered strategy', () => {
    const registry = createFrameworkRegistry();
    registry.register({
      framework: 'unknown',
      matches: (scan) => scan.framework === 'unknown',
      plan: () => [],
    });

    expect(registry.resolve(baseProjectScan)?.framework).toBe('unknown');
    expect(registry.resolve({ ...baseProjectScan, framework: 'astro' })).toBeUndefined();
  });

  it('pre-registers the Next.js strategy in the default registry', () => {
    const registry = createDefaultFrameworkRegistry();

    expect(registry.resolve({ ...baseProjectScan, framework: 'nextjs' })).toBe(nextjsStrategy);
  });

  it('lets a custom registry contribute framework-specific tasks', () => {
    const registry = createFrameworkRegistry();
    registry.register({
      framework: 'unknown',
      matches: (scan) => scan.framework === 'unknown',
      plan: ({ appSlug, repoTaskId }) => [
        {
          id: 'custom-framework-task',
          name: 'Run custom framework task',
          provider: 'custom',
          action: 'run',
          params: { appSlug },
          dependsOn: [repoTaskId],
        },
      ],
    });

    const plan = createRunPlanFromProjectScan(baseProjectScan, { frameworkRegistry: registry });

    expect(plan.tasks.map((task) => task.id)).toEqual([
      'github-create-repo',
      'github-push-code',
      'custom-framework-task',
    ]);
    expect(plan.tasks.find((task) => task.id === 'custom-framework-task')?.params).toEqual({
      appSlug: 'strategy-app',
    });
  });
});
