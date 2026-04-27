import React from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { Task } from '@assembler/types';

export type FailureAction = 'retry' | 'skip' | 'abort';

interface TaskProgressListProps {
  tasks: Task[];
  onFailureAction?: ((taskId: string, action: FailureAction) => void) | undefined;
}

export function TaskProgressList({ tasks, onFailureAction }: TaskProgressListProps) {
  const completed = tasks.filter(
    (t) => t.status === 'success' || t.status === 'failed' || t.status === 'skipped' || t.status === 'rolled_back',
  ).length;

  const failedTask = onFailureAction
    ? tasks.find((t) => t.status === 'failed')
    : undefined;

  return (
    <Box flexDirection="column">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
      {failedTask && onFailureAction ? (
        <FailurePrompt
          taskName={failedTask.name}
          error={failedTask.error}
          onAction={(action) => onFailureAction(failedTask.id, action)}
        />
      ) : (
        <Box marginTop={1}>
          <Text dimColor>
            {completed}/{tasks.length} tasks complete
          </Text>
        </Box>
      )}
    </Box>
  );
}

function FailurePrompt({
  taskName,
  error,
  onAction,
}: {
  taskName: string;
  error?: string | undefined;
  onAction: (action: FailureAction) => void;
}) {
  useInput((input) => {
    if (input === 'r' || input === 'R') {
      onAction('retry');
    } else if (input === 's' || input === 'S') {
      onAction('skip');
    } else if (input === 'a' || input === 'A') {
      onAction('abort');
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="single" borderColor="red" paddingX={1} flexDirection="column">
        <Text bold color="red">Task failed: {taskName}</Text>
        {error ? (
          <Text color="red" dimColor>{error}</Text>
        ) : null}
        <Box marginTop={1}>
          <Text>
            <Text bold color="yellow">[r]</Text><Text>etry</Text>
            <Text>  </Text>
            <Text bold color="yellow">[s]</Text><Text>kip</Text>
            <Text>  </Text>
            <Text bold color="yellow">[a]</Text><Text>bort</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function TaskRow({ task }: { task: Task }) {
  const color = statusColor(task.status);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{statusIcon(task.status)} </Text>
        {color ? (
          <Text color={color}>{task.name}</Text>
        ) : (
          <Text>{task.name}</Text>
        )}
      </Box>
      {task.status === 'failed' && task.error ? (
        <Box marginLeft={4}>
          <Text color="red" dimColor>{task.error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function statusIcon(status: Task['status']): React.ReactNode {
  switch (status) {
    case 'success':
      return <Text color="green">✓</Text>;
    case 'failed':
      return <Text color="red">✗</Text>;
    case 'running':
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    case 'skipped':
      return <Text color="yellow">○</Text>;
    case 'rolled_back':
      return <Text dimColor>↺</Text>;
    case 'pending':
    default:
      return <Text dimColor>○</Text>;
  }
}

function statusColor(status: Task['status']): string | undefined {
  switch (status) {
    case 'success':
      return 'green';
    case 'failed':
      return 'red';
    case 'running':
      return 'cyan';
    case 'skipped':
      return 'yellow';
    case 'pending':
    default:
      return undefined;
  }
}
