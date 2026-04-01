import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmPromptProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmPrompt({ message, onConfirm, onCancel }: ConfirmPromptProps) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{message}</Text>
      <Text dimColor>Press enter or y to continue. Press esc or n to cancel.</Text>
    </Box>
  );
}
