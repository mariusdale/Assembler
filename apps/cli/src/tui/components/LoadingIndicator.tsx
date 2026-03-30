import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export function LoadingIndicator({ message }: { message: string }) {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text> {message}</Text>
    </Box>
  );
}
