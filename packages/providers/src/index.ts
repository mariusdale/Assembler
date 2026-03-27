import type { ProviderPack } from '@devassemble/types';

import { githubProviderPack } from './github/index.js';
import { neonProviderPack } from './neon/index.js';
import {
  clerkProviderPack,
  cloudflareProviderPack,
  placeholderProviderPacks,
  posthogProviderPack,
  resendProviderPack,
  sentryProviderPack,
  stripeProviderPack,
  vercelProviderPack,
} from './placeholders.js';

export const plannedProviders = [
  'github',
  'neon',
  'vercel',
  'clerk',
  'stripe',
  'cloudflare',
  'resend',
  'sentry',
  'posthog',
] as const;

export type PlannedProvider = (typeof plannedProviders)[number];

export function createProviderRegistry(): Record<string, ProviderPack> {
  return {
    github: githubProviderPack,
    neon: neonProviderPack,
    ...placeholderProviderPacks,
  };
}

export {
  clerkProviderPack,
  cloudflareProviderPack,
  githubProviderPack,
  neonProviderPack,
  posthogProviderPack,
  resendProviderPack,
  sentryProviderPack,
  stripeProviderPack,
  vercelProviderPack,
};
