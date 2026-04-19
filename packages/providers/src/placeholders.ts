import type { ProviderPack } from '@assembler/types';

import { createPlaceholderProviderPack } from './shared/placeholder.js';

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

export const placeholderProviderPacks: Record<string, ProviderPack> = {
  posthog: posthogProviderPack,
};
