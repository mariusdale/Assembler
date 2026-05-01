import React from 'react';
import { Box, Text } from 'ink';

export function Header() {
  const cwd = process.cwd();
  const shortCwd = cwd.replace(process.env.HOME ?? '', '~');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        Assembler <Text dimColor>v0.1.0</Text>
      </Text>
      <Text dimColor>Launch and operate existing applications from the terminal</Text>
      <Text dimColor>{shortCwd}</Text>
    </Box>
  );
}
