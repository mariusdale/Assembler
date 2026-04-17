import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { TuiAction, ScreenName } from '../types.js';
import { useCliApp } from '../context.js';

interface MenuItem {
  label: string;
  value: ScreenName | 'quit';
  description: string;
}

const PRIMARY_ITEMS: MenuItem[] = [
  { label: 'Launch', value: 'launch', description: 'Run the launch flow for this project' },
  { label: 'Doctor', value: 'doctor', description: 'Review readiness and provider health' },
  { label: 'Credentials', value: 'creds', description: 'Connect required launch credentials' },
  { label: 'Status', value: 'status', description: 'Inspect recent deployment history' },
];

const SECONDARY_ITEMS: MenuItem[] = [
  { label: 'Preview', value: 'preview', description: 'Create or remove a preview environment' },
  { label: 'Domains', value: 'domain', description: 'Attach a custom domain' },
  { label: 'Environment Sync', value: 'env', description: 'Pull or push environment variables' },
  { label: 'Teardown', value: 'teardown', description: 'Remove provisioned resources' },
  { label: 'Help', value: 'help', description: 'Show command and navigation help' },
  { label: 'Quit', value: 'quit', description: 'Exit DevAssemble' },
];

type ReadinessTone = 'ready' | 'action_required' | 'blocked';

interface HomeAssessment {
  projectName: string;
  projectPath: string;
  tone: ReadinessTone;
  summary: string;
  detail: string;
  recommendedAction: ScreenName;
}

export function HomeScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [assessment, setAssessment] = useState<HomeAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const menuItems = useMemo(() => [...PRIMARY_ITEMS, ...SECONDARY_ITEMS], []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [scan, credentials] = await Promise.all([app.scan(), app.listCredentials()]);
        if (cancelled) {
          return;
        }
        setAssessment(buildAssessment(scan, credentials));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [app]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((current) => (current === 0 ? menuItems.length - 1 : current - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => (current === menuItems.length - 1 ? 0 : current + 1));
      return;
    }

    if (key.return) {
      const item = menuItems[selectedIndex] ?? menuItems[0];
      if (!item) {
        return;
      }
      if (item.value === 'quit') {
        exit();
        return;
      }
      dispatch({ type: 'navigate', screen: item.value });
      return;
    }

    if (input.toLowerCase() === 'q') {
      exit();
    }
  });

  const recommendedAction =
    assessment && menuItems.find((item) => item.value === assessment.recommendedAction)
      ? menuItems.find((item) => item.value === assessment.recommendedAction)
      : PRIMARY_ITEMS[0];

  return (
    <Box flexDirection="column">
      <Text bold>Control Center</Text>
      <Text dimColor>Assess, launch, and operate the current Next.js project from one terminal workflow.</Text>

      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        borderColor={assessment?.tone === 'blocked' ? 'red' : assessment?.tone === 'action_required' ? 'yellow' : 'cyan'}
        paddingX={1}
      >
        <Text bold>{assessment?.projectName ?? 'Current Project'}</Text>
        <Text dimColor>{assessment?.projectPath ?? process.cwd().replace(process.env.HOME ?? '', '~')}</Text>
        <Box marginTop={1} flexDirection="column">
          {loading ? (
            <Text dimColor>Assessing project readiness...</Text>
          ) : loadError ? (
            <>
              <Text color="red" bold>Assessment unavailable</Text>
              <Text dimColor>{loadError}</Text>
              <Text dimColor>Recommended next action: Doctor</Text>
            </>
          ) : (
            <>
              <Text color={assessment?.tone === 'blocked' ? 'red' : assessment?.tone === 'action_required' ? 'yellow' : 'green'} bold>
                {assessment?.summary}
              </Text>
              <Text dimColor>{assessment?.detail}</Text>
              <Text dimColor>Recommended next action: {recommendedAction?.label}</Text>
            </>
          )}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Primary Actions</Text>
        <Text dimColor>Launch, validate readiness, or connect required providers.</Text>
        <Box marginTop={1} flexDirection="column">
          {PRIMARY_ITEMS.map((item, index) => (
            <MenuRow key={item.value} item={item} selected={selectedIndex === index} />
          ))}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Operations</Text>
        <Text dimColor>Secondary workflows for previews, domains, environment sync, and cleanup.</Text>
        <Box marginTop={1} flexDirection="column">
          {SECONDARY_ITEMS.map((item, index) => (
            <MenuRow
              key={item.value}
              item={item}
              selected={selectedIndex === PRIMARY_ITEMS.length + index}
            />
          ))}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Use ↑ ↓ to move, enter to select, and q to quit.</Text>
      </Box>
    </Box>
  );
}

function MenuRow({
  item,
  selected,
}: {
  item: MenuItem;
  selected: boolean;
}) {
  const content = (
    <>
      {selected ? '› ' : '  '}
      <Text bold={selected}>{item.label}</Text>
      <Text dimColor>{`  ${item.description}`}</Text>
    </>
  );

  return selected ? <Text color="cyan">{content}</Text> : <Text>{content}</Text>;
}

function buildAssessment(
  scan: {
    name: string;
    directory: string;
    framework: string;
    lockfileCheck: {
      lockfileExists: boolean;
      inSync: boolean;
    };
    packageJson?: Record<string, unknown>;
  },
  credentials: string[],
): HomeAssessment {
  const scripts =
    scan.packageJson && typeof scan.packageJson === 'object'
      ? (scan.packageJson.scripts as Record<string, unknown> | undefined)
      : undefined;
  const buildScript =
    scripts && typeof scripts.build === 'string' && scripts.build.trim() !== ''
      ? scripts.build
      : undefined;
  const missingRequiredCredentials = ['github', 'vercel'].filter(
    (provider) => !credentials.includes(provider),
  );
  const projectPath = scan.directory.replace(process.env.HOME ?? '', '~');

  if (scan.framework !== 'nextjs') {
    return {
      projectName: scan.name,
      projectPath,
      tone: 'blocked',
      summary: 'Blocked: unsupported project type',
      detail: 'DevAssemble currently supports production launch workflows for existing Next.js applications only.',
      recommendedAction: 'doctor',
    };
  }

  if (!scan.lockfileCheck.lockfileExists) {
    return {
      projectName: scan.name,
      projectPath,
      tone: 'blocked',
      summary: 'Blocked: lockfile required',
      detail: 'Create and commit a package manager lockfile before launching or previewing this project.',
      recommendedAction: 'doctor',
    };
  }

  if (!scan.lockfileCheck.inSync) {
    return {
      projectName: scan.name,
      projectPath,
      tone: 'blocked',
      summary: 'Blocked: lockfile out of sync',
      detail: 'Run your package manager install command and commit the updated lockfile before launch.',
      recommendedAction: 'doctor',
    };
  }

  if (!buildScript) {
    return {
      projectName: scan.name,
      projectPath,
      tone: 'blocked',
      summary: 'Blocked: build script missing',
      detail: 'Add a usable build script to package.json so hosted builds have a clear entry point.',
      recommendedAction: 'doctor',
    };
  }

  if (missingRequiredCredentials.length > 0) {
    return {
      projectName: scan.name,
      projectPath,
      tone: 'action_required',
      summary: 'Action required: connect launch credentials',
      detail: `DevAssemble needs ${missingRequiredCredentials.join(' and ')} before it can launch this project.`,
      recommendedAction: 'creds',
    };
  }

  return {
    projectName: scan.name,
    projectPath,
    tone: 'ready',
    summary: 'Ready to launch',
    detail: 'The current project matches the supported launch path and has the required credentials connected.',
    recommendedAction: 'launch',
  };
}
