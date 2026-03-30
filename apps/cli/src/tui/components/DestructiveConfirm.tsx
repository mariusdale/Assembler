import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface DestructiveConfirmProps {
  message: string;
  confirmWord: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DestructiveConfirm({
  message,
  confirmWord,
  onConfirm,
  onCancel,
}: DestructiveConfirmProps) {
  const [value, setValue] = useState('');

  return (
    <Box flexDirection="column">
      <Text color="red">{message}</Text>
      <Box marginTop={1}>
        <Text>Type "{confirmWord}" to confirm: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => {
            if (v === confirmWord) {
              onConfirm();
            } else {
              onCancel();
            }
          }}
        />
      </Box>
      <Text dimColor>Press esc to cancel</Text>
    </Box>
  );
}
