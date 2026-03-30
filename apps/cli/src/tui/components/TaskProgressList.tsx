import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { Task } from '@devassemble/types';

export function TaskProgressList({ tasks }: { tasks: Task[] }) {
  const completed = tasks.filter(
    (t) => t.status === 'success' || t.status === 'failed' || t.status === 'skipped' || t.status === 'rolled_back',
  ).length;

  return (
    <Box flexDirection="column">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          {completed}/{tasks.length} tasks complete
        </Text>
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
