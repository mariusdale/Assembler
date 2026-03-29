import type { ProviderPack } from '@devassemble/types';

import { createPlaceholderProviderPack } from './shared/placeholder.js';

export const clerkProviderPack = createPlaceholderProviderPack({
  name: 'clerk',
  actions: ['create-application', 'configure-auth', 'capture-secret-key', 'capture-publishable-key'],
  createOutputs: (action, { task }) => {
    const appName =
      typeof task.params.appName === 'string' && task.params.appName.trim() !== ''
        ? task.params.appName
        : task.id;

    switch (action) {
      case 'create-application':
        return {
          applicationId: `${appName}-clerk-app`,
        };
      case 'capture-secret-key':
        return {
          secretKey: 'clerk_test_placeholder_secret_key',
        };
      case 'capture-publishable-key':
        return {
          publishableKey: 'pk_test_placeholder_clerk_publishable_key',
        };
      default:
        return {};
    }
  },
});

export const resendProviderPack = createPlaceholderProviderPack({
  name: 'resend',
  actions: ['verify-sending-domain', 'create-api-key', 'capture-api-key'],
  createOutputs: (action) => {
    if (action === 'capture-api-key') {
      return {
        apiKey: 're_placeholder_resend_api_key',
      };
    }

    return {};
  },
});

export const sentryProviderPack = createPlaceholderProviderPack({
  name: 'sentry',
  actions: ['create-project', 'add-nextjs-plugin', 'capture-dsn'],
  createOutputs: (action, { task }) => {
    if (action === 'create-project') {
      return {
        projectSlug: task.id,
      };
    }

    if (action === 'capture-dsn') {
      return {
        dsn: 'https://placeholderPublicKey@o0.ingest.sentry.io/0',
      };
    }

    return {};
  },
});

export const posthogProviderPack = createPlaceholderProviderPack({
  name: 'posthog',
  actions: ['create-project', 'add-provider', 'capture-api-key'],
  createOutputs: (action, { task }) => {
    if (action === 'create-project') {
      return {
        projectId: `posthog-${task.id}`,
      };
    }

    if (action === 'capture-api-key') {
      return {
        apiKey: 'phc_placeholder_posthog_api_key',
      };
    }

    return {};
  },
});

export const cloudflareProviderPack = createPlaceholderProviderPack({
  name: 'cloudflare',
  actions: ['add-domain', 'create-dns-records', 'verify-propagation'],
});

export const placeholderProviderPacks: Record<string, ProviderPack> = {
  clerk: clerkProviderPack,
  resend: resendProviderPack,
  sentry: sentryProviderPack,
  posthog: posthogProviderPack,
  cloudflare: cloudflareProviderPack,
};
