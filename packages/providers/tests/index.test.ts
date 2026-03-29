import { describe, expect, it } from 'vitest';

import { createProviderRegistry, plannedProviders } from '../src/index.js';

describe('provider registry', () => {
  it('tracks the golden-path provider list', () => {
    expect(plannedProviders).toContain('github');
    expect(plannedProviders).toContain('neon');
    expect(plannedProviders).toContain('vercel');
  });

  it('registers github and neon provider packs', () => {
    const registry = createProviderRegistry();

    expect(registry.github?.name).toBe('github');
    expect(registry.neon?.name).toBe('neon');
    expect(registry.vercel?.name).toBe('vercel');
    expect(registry.clerk?.name).toBe('clerk');
    expect(registry.github?.actions).toContain('create-repo');
    expect(registry.neon?.actions).toContain('create-project');
    expect(registry.vercel?.actions).toContain('deploy-preview');
    expect(registry.stripe?.actions).toContain('capture-keys');
  });
});
