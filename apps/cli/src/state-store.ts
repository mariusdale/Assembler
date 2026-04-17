import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  SqliteRunStateStore,
  type CredentialRecord,
  type RunStateStore,
  type SerializedRunPlan,
} from '@devassemble/core';
import type { PreviewRecord, RunEvent, RunPlan, Task } from '@devassemble/types';

const STATE_DIRECTORY_NAME = '.devassemble';
const SQLITE_STATE_FILENAME = 'state.db';
const FILE_STATE_FILENAME = 'state.json';

export interface LocalStateStore extends RunStateStore {
  savePreview(preview: PreviewRecord): void;
  loadPreview(branchName: string): PreviewRecord | undefined;
  listPreviews(parentRunId?: string): PreviewRecord[];
  updatePreviewStatus(id: string, status: 'active' | 'torn_down'): void;
}

interface FileStoreData {
  runs: Array<{
    id: string;
    status: RunPlan['status'];
    updatedAt: string;
    run: SerializedRunPlan;
  }>;
  events: Array<SerializedRunEvent>;
  credentials: CredentialRecord[];
  previews: PreviewRecord[];
}

interface SerializedRunEvent extends Omit<RunEvent, 'timestamp'> {
  timestamp: string;
}

export function createStateStore(cwd: string): LocalStateStore {
  const sqliteFilename = resolveStatePath(cwd, SQLITE_STATE_FILENAME);

  try {
    const sqliteStore = new SqliteRunStateStore({ filename: sqliteFilename });
    sqliteStore.initialize();
    return sqliteStore as LocalStateStore;
  } catch (error) {
    const fileFilename = resolveStatePath(cwd, FILE_STATE_FILENAME);
    const fileStore = new FileRunStateStore(fileFilename);
    fileStore.initialize();

    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: SQLite state store unavailable; using file-backed state at ${fileFilename}. ${reason}`,
    );

    return fileStore;
  }
}

class FileRunStateStore implements LocalStateStore {
  private data: FileStoreData = createEmptyData();

  constructor(private readonly filename: string) {}

  initialize(): void {
    mkdirSync(dirname(this.filename), { recursive: true });
    if (!existsSync(this.filename)) {
      this.persist();
      return;
    }

    const raw = readFileSync(this.filename, 'utf8').trim();
    if (raw === '') {
      this.persist();
      return;
    }

    const parsed = JSON.parse(raw) as Partial<FileStoreData>;
    this.data = {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
      previews: Array.isArray(parsed.previews) ? parsed.previews : [],
    };
  }

  saveRun(runPlan: RunPlan): void {
    const nextRow = {
      id: runPlan.id,
      status: runPlan.status,
      updatedAt: new Date().toISOString(),
      run: serializeRunPlan(runPlan),
    };

    const index = this.data.runs.findIndex((row) => row.id === runPlan.id);
    if (index >= 0) {
      this.data.runs[index] = nextRow;
    } else {
      this.data.runs.push(nextRow);
    }
    this.persist();
  }

  loadRun(runId: string): RunPlan | undefined {
    const row = this.data.runs.find((entry) => entry.id === runId);
    return row ? hydrateRunPlan(row.run) : undefined;
  }

  listRuns(): RunPlan[] {
    return [...this.data.runs]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((row) => hydrateRunPlan(row.run));
  }

  listEvents(runId: string): RunEvent[] {
    return this.data.events
      .filter((event) => event.runId === runId)
      .map(hydrateRunEvent);
  }

  appendEvent(event: RunEvent): void {
    this.data.events.push(serializeRunEvent(event));
    this.persist();
  }

  saveRunWithEvent(runPlan: RunPlan, event: RunEvent): void {
    this.saveRun(runPlan);
    this.appendEvent(event);
  }

  putCredentialRecord(record: CredentialRecord): void {
    const index = this.data.credentials.findIndex((entry) => entry.provider === record.provider);
    if (index >= 0) {
      this.data.credentials[index] = record;
    } else {
      this.data.credentials.push(record);
    }
    this.persist();
  }

  getCredentialRecord(provider: string): CredentialRecord | undefined {
    return this.data.credentials.find((entry) => entry.provider === provider);
  }

  listCredentialRecords(): CredentialRecord[] {
    return [...this.data.credentials].sort((a, b) => a.provider.localeCompare(b.provider));
  }

  savePreview(preview: PreviewRecord): void {
    const index = this.data.previews.findIndex((entry) => entry.id === preview.id);
    if (index >= 0) {
      this.data.previews[index] = preview;
    } else {
      this.data.previews.push(preview);
    }
    this.persist();
  }

  loadPreview(branchName: string): PreviewRecord | undefined {
    return [...this.data.previews]
      .filter((preview) => preview.branchName === branchName && preview.status === 'active')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  listPreviews(parentRunId?: string): PreviewRecord[] {
    return [...this.data.previews]
      .filter((preview) => (parentRunId ? preview.parentRunId === parentRunId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updatePreviewStatus(id: string, status: 'active' | 'torn_down'): void {
    const preview = this.data.previews.find((entry) => entry.id === id);
    if (preview) {
      preview.status = status;
      this.persist();
    }
  }

  close(): void {
    this.persist();
  }

  private persist(): void {
    writeFileSync(this.filename, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }
}

function resolveStatePath(cwd: string, filename: string): string {
  const preferredDirectory = resolve(cwd, STATE_DIRECTORY_NAME);
  mkdirSync(preferredDirectory, { recursive: true });
  return join(preferredDirectory, filename);
}

function createEmptyData(): FileStoreData {
  return {
    runs: [],
    events: [],
    credentials: [],
    previews: [],
  };
}

function serializeRunEvent(event: RunEvent): SerializedRunEvent {
  return {
    ...event,
    timestamp: event.timestamp.toISOString(),
  };
}

function hydrateRunEvent(event: SerializedRunEvent): RunEvent {
  return {
    ...event,
    timestamp: new Date(event.timestamp),
  };
}

function serializeRunPlan(runPlan: RunPlan): SerializedRunPlan {
  return {
    ...runPlan,
    createdAt: runPlan.createdAt.toISOString(),
    tasks: runPlan.tasks.map(serializeTask),
  };
}

function serializeTask(task: Task): SerializedRunPlan['tasks'][number] {
  const serializedTask: SerializedRunPlan['tasks'][number] = {
    id: task.id,
    name: task.name,
    provider: task.provider,
    action: task.action,
    params: task.params,
    dependsOn: task.dependsOn,
    outputs: task.outputs,
    status: task.status,
    risk: task.risk,
    requiresApproval: task.requiresApproval,
    retryPolicy: task.retryPolicy,
    timeoutMs: task.timeoutMs,
    ...(task.error ? { error: task.error } : {}),
  };

  return {
    ...serializedTask,
    ...(task.startedAt ? { startedAt: task.startedAt.toISOString() } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt.toISOString() } : {}),
  };
}

function hydrateRunPlan(serialized: SerializedRunPlan): RunPlan {
  return {
    ...serialized,
    createdAt: new Date(serialized.createdAt),
    tasks: serialized.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      provider: task.provider,
      action: task.action,
      params: task.params,
      dependsOn: task.dependsOn,
      outputs: task.outputs,
      status: task.status,
      risk: task.risk,
      requiresApproval: task.requiresApproval,
      retryPolicy: task.retryPolicy,
      timeoutMs: task.timeoutMs,
      ...(task.error ? { error: task.error } : {}),
      ...(task.startedAt ? { startedAt: new Date(task.startedAt) } : {}),
      ...(task.completedAt ? { completedAt: new Date(task.completedAt) } : {}),
    })),
  };
}
