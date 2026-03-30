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
        <Text bold>Commands</Text>
        <Text>  <Text color="cyan">Launch</Text>          Scan, provision, and deploy your project</Text>
        <Text>  <Text color="cyan">Plan</Text>            Show execution plan without deploying</Text>
        <Text>  <Text color="cyan">Status</Text>          View recent deployment runs</Text>
        <Text>  <Text color="cyan">Setup</Text>           Configure provider credentials (guided)</Text>
        <Text>  <Text color="cyan">Teardown</Text>        Delete all provisioned resources</Text>
        <Text>  <Text color="cyan">Env</Text>             Sync environment variables with Vercel</Text>
        <Text>  <Text color="cyan">Preview</Text>         Create/teardown per-branch preview environments</Text>
        <Text>  <Text color="cyan">Domain</Text>          Configure a custom domain (Cloudflare + Vercel)</Text>
        <Text>  <Text color="cyan">Credentials</Text>     Manage provider API tokens</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Navigation</Text>
        <Text>  <Text color="cyan">↑↓</Text>             Navigate menus</Text>
        <Text>  <Text color="cyan">⏎</Text>              Select item</Text>
        <Text>  <Text color="cyan">esc</Text>             Go back</Text>
        <Text>  <Text color="cyan">q</Text>               Quit (from home screen)</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>CLI Mode</Text>
        <Text dimColor>  You can also run commands directly:</Text>
        <Text dimColor>  devassemble launch, devassemble plan, etc.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press esc to go back</Text>
      </Box>
    </Box>
  );
}
