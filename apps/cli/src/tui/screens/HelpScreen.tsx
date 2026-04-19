import React from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../hooks/use-navigation.js';
import type { TuiAction } from '../types.js';

export function HelpScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  useNavigation(dispatch);

  return (
    <Box flexDirection="column">
      <Text bold>Help</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Recommended Workflow</Text>
        <Text dimColor>Use the TUI as the primary launch experience for existing Next.js applications.</Text>
        <Text dimColor>Start with Credentials if providers are missing, Doctor if readiness looks blocked, and Launch when the project is ready.</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Primary Actions</Text>
        <Text>  <Text color="cyan">Launch</Text>          Review readiness, approve the plan, and execute the launch</Text>
        <Text>  <Text color="cyan">Doctor</Text>          Validate project readiness and provider health</Text>
        <Text>  <Text color="cyan">Credentials</Text>     Connect or replace provider credentials</Text>
        <Text>  <Text color="cyan">Status</Text>          Inspect recent deployment history and recovery options</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Operational Actions</Text>
        <Text>  <Text color="cyan">Preview</Text>         Create or remove a branch preview environment</Text>
        <Text>  <Text color="cyan">Domain</Text>          Attach a custom domain with Cloudflare and Vercel</Text>
        <Text>  <Text color="cyan">Env</Text>             Pull or push environment variables</Text>
        <Text>  <Text color="cyan">Teardown</Text>        Remove provisioned resources from a launch run</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>CLI Shortcuts</Text>
        <Text dimColor>Most teams can stay inside the TUI, but direct commands remain available for automation and fast follow-up tasks.</Text>
        <Text dimColor>`assembler setup` remains available as a legacy shortcut, but Credentials is the primary onboarding path.</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Navigation</Text>
        <Text>  <Text color="cyan">↑ ↓</Text>             Move through available actions</Text>
        <Text>  <Text color="cyan">⏎</Text>              Select the current action</Text>
        <Text>  <Text color="cyan">esc</Text>             Go back</Text>
        <Text>  <Text color="cyan">q</Text>               Quit from the home screen</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press esc to go back</Text>
      </Box>
    </Box>
  );
}
