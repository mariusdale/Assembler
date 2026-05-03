import type { ProviderPack } from '@assembler/types';

import { clerkProviderPack } from './clerk/index.js';
import { cloudflareProviderPack } from './cloudflare/index.js';
import { githubProviderPack } from './github/index.js';
import { neonProviderPack } from './neon/index.js';
import { resendProviderPack } from './resend/index.js';
import { sentryProviderPack } from './sentry/index.js';
import { stripeProviderPack } from './stripe/index.js';
import { vercelDeploymentTarget, vercelProviderPack } from './vercel/index.js';

export const plannedProviders = [
  'github',
  'neon',
  'vercel',
  'clerk',
  'stripe',
  'cloudflare',
  'resend',
  'sentry',
] as const;

export type PlannedProvider = (typeof plannedProviders)[number];

export function createProviderRegistry(): Record<string, ProviderPack> {
  return {
    clerk: clerkProviderPack,
    cloudflare: cloudflareProviderPack,
    github: githubProviderPack,
    neon: neonProviderPack,
    resend: resendProviderPack,
    sentry: sentryProviderPack,
    stripe: stripeProviderPack,
    vercel: vercelProviderPack,
  };
}

export { VercelClient } from './vercel/client.js';

export {
  clerkProviderPack,
  cloudflareProviderPack,
  githubProviderPack,
  neonProviderPack,
  resendProviderPack,
  sentryProviderPack,
  stripeProviderPack,
  vercelDeploymentTarget,
  vercelProviderPack,
};

export { ClerkClient } from './clerk/client.js';
export { CloudflareClient } from './cloudflare/client.js';
export { NeonClient } from './neon/client.js';
export { ResendClient } from './resend/client.js';
export { SentryClient } from './sentry/client.js';
