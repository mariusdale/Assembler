import React from 'react';
import { Box, Text } from 'ink';

export function Header() {
  const cwd = process.cwd();
  const shortCwd = cwd.replace(process.env.HOME ?? '', '~');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        DevAssemble <Text dimColor>v0.1.0</Text>
      </Text>
      <Text dimColor>{shortCwd}</Text>
    </Box>
  );
}
