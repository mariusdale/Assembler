import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface SecretInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function SecretInput({ label, value, onChange, onSubmit }: SecretInputProps) {
  return (
    <Box>
      <Text>{label} </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} mask="*" />
    </Box>
  );
}
