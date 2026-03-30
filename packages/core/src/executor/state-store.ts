import Database from 'better-sqlite3';
import type { PreviewRecord, RunEvent, RunPlan, Task } from '@devassemble/types';

import type { CredentialRecord, RunStateStore, SerializedRunPlan } from './types.js';

export interface SqliteRunStateStoreOptions {
  filename?: string;
}

export class SqliteRunStateStore implements RunStateStore {
  private readonly database: Database.Database;

  constructor(options: SqliteRunStateStoreOptions = {}) {
    this.database = new Database(options.filename ?? ':memory:');
  }

  initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        run_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        task_id TEXT,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS credentials (
        provider TEXT PRIMARY KEY,
        reference TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS previews (
        id TEXT PRIMARY KEY,
        parent_run_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        preview_run_id TEXT NOT NULL,
        neon_branch_id TEXT,
        neon_project_id TEXT,
        vercel_deployment_id TEXT,
        preview_url TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
    `);
  }

  saveRun(runPlan: RunPlan): void {
    const statement = this.database.prepare(`
      INSERT INTO runs (id, run_json, status, created_at, updated_at)
      VALUES (@id, @run_json, @status, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        run_json = excluded.run_json,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    statement.run(toRunRow(runPlan));
  }

  loadRun(runId: string): RunPlan | undefined {
    const row = this.database
      .prepare('SELECT run_json FROM runs WHERE id = ?')
      .get(runId) as { run_json: string } | undefined;

    if (!row) {
      return undefined;
    }

    return hydrateRunPlan(JSON.parse(row.run_json) as SerializedRunPlan);
  }

  listRuns(): RunPlan[] {
    const rows = this.database
      .prepare('SELECT run_json FROM runs ORDER BY updated_at DESC')
      .all() as Array<{ run_json: string }>;

    return rows.map((row) => hydrateRunPlan(JSON.parse(row.run_json) as SerializedRunPlan));
  }

  listEvents(runId: string): RunEvent[] {
    const rows = this.database
      .prepare(
        'SELECT id, run_id, task_id, type, level, message, timestamp, metadata_json FROM events WHERE run_id = ? ORDER BY rowid ASC',
      )
      .all(runId) as Array<{
        id: string;
        run_id: string;
        task_id: string | null;
        type: RunEvent['type'];
        level: RunEvent['level'];
        message: string;
        timestamp: string;
        metadata_json: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      ...(row.task_id ? { taskId: row.task_id } : {}),
      type: row.type,
      level: row.level,
      message: row.message,
      timestamp: new Date(row.timestamp),
      ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) as Record<string, unknown> } : {}),
    }));
  }

  appendEvent(event: RunEvent): void {
    this.database
      .prepare(
        `
          INSERT INTO events (id, run_id, task_id, type, level, message, timestamp, metadata_json)
          VALUES (@id, @run_id, @task_id, @type, @level, @message, @timestamp, @metadata_json)
        `,
      )
      .run(toEventRow(event));
  }

  saveRunWithEvent(runPlan: RunPlan, event: RunEvent): void {
    const transaction = this.database.transaction(() => {
      this.saveRun(runPlan);
      this.appendEvent(event);
    });

    transaction();
  }

  putCredentialRecord(record: CredentialRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO credentials (provider, reference, metadata_json)
          VALUES (@provider, @reference, @metadata_json)
          ON CONFLICT(provider) DO UPDATE SET
            reference = excluded.reference,
            metadata_json = excluded.metadata_json
        `,
      )
      .run({
        provider: record.provider,
        reference: record.reference,
        metadata_json: record.metadata ? JSON.stringify(record.metadata) : null,
      });
  }

  getCredentialRecord(provider: string): CredentialRecord | undefined {
    const row = this.database
      .prepare('SELECT provider, reference, metadata_json FROM credentials WHERE provider = ?')
      .get(provider) as
      | {
          provider: string;
          reference: string;
          metadata_json: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      provider: row.provider,
      reference: row.reference,
      ...(row.metadata_json
        ? { metadata: JSON.parse(row.metadata_json) as Record<string, unknown> }
        : {}),
    };
  }

  listCredentialRecords(): CredentialRecord[] {
    const rows = this.database
      .prepare('SELECT provider, reference, metadata_json FROM credentials ORDER BY provider ASC')
      .all() as Array<{
        provider: string;
        reference: string;
        metadata_json: string | null;
      }>;

    return rows.map((row) => ({
      provider: row.provider,
      reference: row.reference,
      ...(row.metadata_json
        ? { metadata: JSON.parse(row.metadata_json) as Record<string, unknown> }
        : {}),
    }));
  }

  savePreview(preview: PreviewRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO previews (id, parent_run_id, branch_name, preview_run_id, neon_branch_id, neon_project_id, vercel_deployment_id, preview_url, created_at, status)
          VALUES (@id, @parent_run_id, @branch_name, @preview_run_id, @neon_branch_id, @neon_project_id, @vercel_deployment_id, @preview_url, @created_at, @status)
          ON CONFLICT(id) DO UPDATE SET
            neon_branch_id = excluded.neon_branch_id,
            neon_project_id = excluded.neon_project_id,
            vercel_deployment_id = excluded.vercel_deployment_id,
            preview_url = excluded.preview_url,
            status = excluded.status
        `,
      )
      .run({
        id: preview.id,
        parent_run_id: preview.parentRunId,
        branch_name: preview.branchName,
        preview_run_id: preview.previewRunId,
        neon_branch_id: preview.neonBranchId ?? null,
        neon_project_id: preview.neonProjectId ?? null,
        vercel_deployment_id: preview.vercelDeploymentId ?? null,
        preview_url: preview.previewUrl ?? null,
        created_at: preview.createdAt,
        status: preview.status,
      });
  }

  loadPreview(branchName: string): PreviewRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM previews WHERE branch_name = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .get(branchName, 'active') as PreviewRow | undefined;

    return row ? toPreviewRecord(row) : undefined;
  }

  listPreviews(parentRunId?: string): PreviewRecord[] {
    const query = parentRunId
      ? 'SELECT * FROM previews WHERE parent_run_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM previews ORDER BY created_at DESC';
    const rows = (parentRunId
      ? this.database.prepare(query).all(parentRunId)
      : this.database.prepare(query).all()) as PreviewRow[];

    return rows.map(toPreviewRecord);
  }

  updatePreviewStatus(id: string, status: 'active' | 'torn_down'): void {
    this.database
      .prepare('UPDATE previews SET status = ? WHERE id = ?')
      .run(status, id);
  }

  close(): void {
    this.database.close();
  }
}

interface PreviewRow {
  id: string;
  parent_run_id: string;
  branch_name: string;
  preview_run_id: string;
  neon_branch_id: string | null;
  neon_project_id: string | null;
  vercel_deployment_id: string | null;
  preview_url: string | null;
  created_at: string;
  status: string;
}

function toPreviewRecord(row: PreviewRow): PreviewRecord {
  return {
    id: row.id,
    parentRunId: row.parent_run_id,
    branchName: row.branch_name,
    previewRunId: row.preview_run_id,
    neonBranchId: row.neon_branch_id ?? undefined,
    neonProjectId: row.neon_project_id ?? undefined,
    vercelDeploymentId: row.vercel_deployment_id ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    createdAt: row.created_at,
    status: row.status as 'active' | 'torn_down',
  };
}

function toRunRow(runPlan: RunPlan): Record<string, string> {
  return {
    id: runPlan.id,
    run_json: JSON.stringify(serializeRunPlan(runPlan)),
    status: runPlan.status,
    created_at: runPlan.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function toEventRow(event: RunEvent): Record<string, string | null> {
  return {
    id: event.id,
    run_id: event.runId,
    task_id: event.taskId ?? null,
    type: event.type,
    level: event.level,
    message: event.message,
    timestamp: event.timestamp.toISOString(),
    metadata_json: event.metadata ? JSON.stringify(event.metadata) : null,
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
    tasks: serialized.tasks.map((task) => {
      const hydratedTask: Task = {
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
      };

      return hydratedTask;
    }),
  };
}
