import React from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import type { TuiAction, ScreenName } from '../types.js';

interface MenuItem {
  label: string;
  value: ScreenName | 'quit' | 'separator';
  description?: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Launch', value: 'launch', description: 'Scan, provision, and deploy' },
  { label: 'Plan', value: 'plan', description: 'Show execution plan (dry run)' },
  { label: 'Status', value: 'status', description: 'View recent runs' },
  { label: 'Setup', value: 'setup', description: 'Configure provider credentials' },
  { label: 'Teardown', value: 'teardown', description: 'Remove provisioned resources' },
  { label: '─────────────', value: 'separator' },
  { label: 'Env', value: 'env', description: 'Sync environment variables' },
  { label: 'Preview', value: 'preview', description: 'Create preview environment' },
  { label: 'Domain', value: 'domain', description: 'Manage custom domains' },
  { label: 'Credentials', value: 'creds', description: 'Manage provider tokens' },
  { label: 'Doctor', value: 'doctor', description: 'Check system readiness' },
  { label: '─────────────', value: 'separator' },
  { label: 'Help', value: 'help', description: 'Show help' },
  { label: 'Quit', value: 'quit', description: 'Exit' },
];

const selectItems = MENU_ITEMS.filter((item) => item.value !== 'separator').map(
  (item) => ({
    label: `${item.label.padEnd(16)}${item.description ?? ''}`,
    value: item.value,
  }),
);

export function HomeScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const { exit } = useApp();

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'quit') {
      exit();
      return;
    }
    dispatch({ type: 'navigate', screen: item.value as ScreenName });
  };

  return (
    <Box flexDirection="column">
      <Text bold>What would you like to do?</Text>
      <Box marginTop={1}>
        <SelectInput items={selectItems} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}
