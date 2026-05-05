import type { ProjectFramework } from '@assembler/types';

export const FRAMEWORK_LABELS: Record<ProjectFramework, string> = {
  nextjs: 'Next.js',
  remix: 'Remix',
  astro: 'Astro',
  static: 'Static site',
  node: 'Node.js',
  unknown: 'Unknown',
};

export const PROVIDER_LABELS: Record<string, string> = {
  clerk: 'Auth: Clerk',
  cloudflare: 'DNS: Cloudflare',
  github: 'Repository: GitHub',
  neon: 'Database: Neon',
  resend: 'Email: Resend',
  sentry: 'Error Tracking: Sentry',
  stripe: 'Payments: Stripe',
  vercel: 'Hosting: Vercel',
};

export function labelFramework(framework: ProjectFramework | string): string {
  return FRAMEWORK_LABELS[framework as ProjectFramework] ?? framework;
}

export function labelProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}
