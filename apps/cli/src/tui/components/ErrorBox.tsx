import React from 'react';
import { Box, Text } from 'ink';

interface ErrorBoxProps {
  message: string;
  remediation?: string;
}

export function ErrorBox({ message, remediation }: ErrorBoxProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="red">✗ {message}</Text>
      {remediation ? (
        <Text dimColor>  → {remediation}</Text>
      ) : null}
    </Box>
  );
}
