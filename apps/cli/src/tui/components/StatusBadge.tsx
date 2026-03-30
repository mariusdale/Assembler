import React from 'react';
import { Text } from 'ink';

const STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  success: 'green',
  failed: 'red',
  executing: 'cyan',
  running: 'cyan',
  draft: 'yellow',
  approved: 'yellow',
  rolled_back: 'magenta',
  pending: 'gray',
  skipped: 'yellow',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'white';
  return <Text color={color}>{status}</Text>;
}
