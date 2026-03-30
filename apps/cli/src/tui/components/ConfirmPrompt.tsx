import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmPromptProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmPrompt({ message, onConfirm, onCancel }: ConfirmPromptProps) {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N') {
      onCancel();
    }
  });

  return (
    <Box>
      <Text>
        {message} <Text dimColor>(y/n)</Text>
      </Text>
    </Box>
  );
}
