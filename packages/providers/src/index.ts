import type { ProviderPack } from '@devassemble/types';

import { clerkProviderPack } from './clerk/index.js';
import { cloudflareProviderPack } from './cloudflare/index.js';
import { githubProviderPack } from './github/index.js';
import { neonProviderPack } from './neon/index.js';
import { stripeProviderPack } from './stripe/index.js';
import { vercelProviderPack } from './vercel/index.js';
import {
  placeholderProviderPacks,
  posthogProviderPack,
  resendProviderPack,
  sentryProviderPack,
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
    clerk: clerkProviderPack,
    cloudflare: cloudflareProviderPack,
    github: githubProviderPack,
    neon: neonProviderPack,
    stripe: stripeProviderPack,
    vercel: vercelProviderPack,
    ...placeholderProviderPacks,
  };
}

export { VercelClient } from './vercel/client.js';

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

export { ClerkClient } from './clerk/client.js';
export { CloudflareClient } from './cloudflare/client.js';
export { NeonClient } from './neon/client.js';
