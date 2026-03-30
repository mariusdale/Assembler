import React from 'react';
import { Box, Text } from 'ink';
import type { ScreenName } from '../types.js';

export function KeyboardHints({ screen }: { screen: ScreenName }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>
        {screen === 'home' ? (
          '↑↓ navigate  ⏎ select  q quit'
        ) : (
          'esc back  q quit'
        )}
      </Text>
    </Box>
  );
}
