import { createHash } from "node:crypto";
import type { AutomationStudioChangeFeedOperation } from "./project-administration.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export type AutomationStudioMutationRecordStatus = "started" | "committed" | "failed";
export type AutomationStudioMutationRecord = {
  mutationId: string;
  operationKind: string;
  ownerKind: string;
  ownerId: string;
  requestDigest: string;
  status: AutomationStudioMutationRecordStatus;
  responseJson: string | null;
  errorJson: string | null;
  firstChangeSequence: number | null;
  lastChangeSequence: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  expiresAt: number | null;
};

export type AutomationStudioMutationTouchedEntity = {
  mutationId: string;
  entityKind: string;
  entityId: string;
  operation: AutomationStudioChangeFeedOperation;
  revision: number | null;
};

export type AutomationStudioProjectMutationContext = {
  sql: AutomationStudioSqlExecutor;
  mutationId: string;
  changedAt: number;
  recordChange(input: { entityKind: string; entityId: string; parentId?: string | null; operation: AutomationStudioChangeFeedOperation; revision: number; hierarchyScope?: { kind: string; id?: string } | null }): Promise<number>;
  recordTouchedEntity(input: { entityKind: string; entityId: string; operation: AutomationStudioChangeFeedOperation; revision?: number | null }): Promise<void>;
};

export type AutomationStudioIdempotentMutationResult<TResult> = {
  mutationId: string;
  replayed: boolean;
  response: TResult;
  firstChangeSequence: number | null;
  lastChangeSequence: number | null;
};

export class AutomationStudioProjectUnitOfWork {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; backup?: (databasePath: string, migrationIds: string[]) => Promise<void> }): Promise<AutomationStudioProjectUnitOfWork> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({
        database: lease.database,
        migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS,
        ...(input.backup ? { backup: (context) => input.backup!(context.databasePath, context.pendingMigrationIds) } : {})
      }).migrate();
      return new AutomationStudioProjectUnitOfWork(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  async runIdempotent<TResult>(input: {
    mutationId: string;
    operationKind: string;
    ownerKind: string;
    ownerId: string;
    request?: unknown;
    requestDigest?: string;
    changedAt?: number;
    expiresAt?: number | null;
  }, operation: (context: AutomationStudioProjectMutationContext) => Promise<TResult>): Promise<AutomationStudioIdempotentMutationResult<TResult>> {
    const mutationId = requiredId(input.mutationId, "mutation");
    const operationKind = requiredKind(input.operationKind, "operation kind");
    const ownerKind = requiredKind(input.ownerKind, "owner kind");
    const ownerId = requiredId(input.ownerId, "owner");
    const requestDigest = input.requestDigest ?? automationStudioMutationDigest(input.request ?? null);
    const changedAt = input.changedAt ?? Date.now();
    try {
      return await this.lease.database.transaction(async (sql) => {
        const existing = await sql.get<MutationRecordRow>("select * from mutation_records where mutation_id = ?", [mutationId]);
        if (existing) return replayExistingMutation<TResult>(existing, requestDigest);
        await sql.run(
          `insert into mutation_records (mutation_id, operation_kind, owner_kind, owner_id, request_digest, status, created_at_ms, updated_at_ms, expires_at_ms)
           values (?, ?, ?, ?, ?, 'started', ?, ?, ?)`,
          [mutationId, operationKind, ownerKind, ownerId, requestDigest, changedAt, changedAt, input.expiresAt ?? null]
        );
        let firstChangeSequence: number | null = null;
        let lastChangeSequence: number | null = null;
        const recordTouchedEntity = async (entity: { entityKind: string; entityId: string; operation: AutomationStudioChangeFeedOperation; revision?: number | null }) => {
          await sql.run(
            `insert into mutation_touched_entities (mutation_id, entity_kind, entity_id, operation, revision) values (?, ?, ?, ?, ?)
             on conflict(mutation_id, entity_kind, entity_id) do update set operation = excluded.operation, revision = excluded.revision`,
            [mutationId, requiredKind(entity.entityKind, "entity kind"), requiredId(entity.entityId, "entity"), entity.operation, entity.revision ?? null]
          );
        };
        const context: AutomationStudioProjectMutationContext = {
          sql,
          mutationId,
          changedAt,
          recordTouchedEntity,
          recordChange: async (change) => {
            const revision = positiveRevision(change.revision);
            const result = await sql.run(
              `insert into change_feed (transaction_id, entity_kind, entity_id, operation, revision, changed_at_ms) values (?, ?, ?, ?, ?, ?)`,
              [mutationId, requiredKind(change.entityKind, "entity kind"), requiredId(change.entityId, "entity"), change.operation, revision, changedAt]
            );
            firstChangeSequence ??= result.lastID;
            lastChangeSequence = result.lastID;
            await recordTouchedEntity({ ...change, revision });
            return result.lastID;
          }
        };
        const response = await operation(context);
        const responseJson = stableStringify(response);
        await sql.run(
          `update mutation_records set status = 'committed', response_json = ?, error_json = null,
            first_change_sequence = ?, last_change_sequence = ?, updated_at_ms = ?, completed_at_ms = ? where mutation_id = ?`,
          [responseJson, firstChangeSequence, lastChangeSequence, changedAt, changedAt, mutationId]
        );
        return { mutationId, replayed: false, response, firstChangeSequence, lastChangeSequence };
      });
    } catch (error) {
      if (error instanceof IdempotentReplayError) throw error;
      await this.persistFailure({ mutationId, operationKind, ownerKind, ownerId, requestDigest, changedAt, expiresAt: input.expiresAt ?? null, error });
      throw error;
    }
  }

  async getMutation(mutationId: string): Promise<AutomationStudioMutationRecord | null> {
    const row = await this.lease.database.get<MutationRecordRow>("select * from mutation_records where mutation_id = ?", [requiredId(mutationId, "mutation")]);
    return row ? mutationFromRow(row) : null;
  }

  async listTouchedEntities(mutationId: string): Promise<AutomationStudioMutationTouchedEntity[]> {
    const rows = await this.lease.database.all<TouchedEntityRow>("select * from mutation_touched_entities where mutation_id = ? order by entity_kind, entity_id", [requiredId(mutationId, "mutation")]);
    return rows.map(touchedEntityFromRow);
  }

  private async persistFailure(input: { mutationId: string; operationKind: string; ownerKind: string; ownerId: string; requestDigest: string; changedAt: number; expiresAt: number | null; error: unknown }): Promise<void> {
    const errorJson = stableStringify({ message: input.error instanceof Error ? input.error.message : String(input.error) }).slice(0, 4_000);
    await this.lease.database.run(
      `insert into mutation_records (mutation_id, operation_kind, owner_kind, owner_id, request_digest, status, error_json, created_at_ms, updated_at_ms, completed_at_ms, expires_at_ms)
       values (?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?, ?)
       on conflict(mutation_id) do update set status = case when mutation_records.status = 'committed' then mutation_records.status else 'failed' end,
         error_json = case when mutation_records.status = 'committed' then mutation_records.error_json else excluded.error_json end,
         updated_at_ms = case when mutation_records.status = 'committed' then mutation_records.updated_at_ms else excluded.updated_at_ms end,
         completed_at_ms = case when mutation_records.status = 'committed' then mutation_records.completed_at_ms else excluded.completed_at_ms end`,
      [input.mutationId, input.operationKind, input.ownerKind, input.ownerId, input.requestDigest, errorJson, input.changedAt, input.changedAt, input.changedAt, input.expiresAt]
    );
  }
}

export function automationStudioMutationDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

class IdempotentReplayError extends Error {}

type MutationRecordRow = { mutation_id: string; operation_kind: string; owner_kind: string; owner_id: string; request_digest: string; status: AutomationStudioMutationRecordStatus; response_json: string | null; error_json: string | null; first_change_sequence: number | null; last_change_sequence: number | null; created_at_ms: number; updated_at_ms: number; completed_at_ms: number | null; expires_at_ms: number | null };
type TouchedEntityRow = { mutation_id: string; entity_kind: string; entity_id: string; operation: AutomationStudioChangeFeedOperation; revision: number | null };

function replayExistingMutation<TResult>(row: MutationRecordRow, requestDigest: string): AutomationStudioIdempotentMutationResult<TResult> {
  if (row.request_digest !== requestDigest) throw new IdempotentReplayError(`Mutation ${row.mutation_id} was already used with a different request digest.`);
  if (row.status === "committed" && row.response_json !== null) {
    return { mutationId: row.mutation_id, replayed: true, response: JSON.parse(row.response_json) as TResult, firstChangeSequence: row.first_change_sequence, lastChangeSequence: row.last_change_sequence };
  }
  throw new IdempotentReplayError(`Mutation ${row.mutation_id} is ${row.status} and cannot be replayed as committed.`);
}

function mutationFromRow(row: MutationRecordRow): AutomationStudioMutationRecord { return { mutationId: row.mutation_id, operationKind: row.operation_kind, ownerKind: row.owner_kind, ownerId: row.owner_id, requestDigest: row.request_digest, status: row.status, responseJson: row.response_json, errorJson: row.error_json, firstChangeSequence: row.first_change_sequence, lastChangeSequence: row.last_change_sequence, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, completedAt: row.completed_at_ms, expiresAt: row.expires_at_ms }; }
function touchedEntityFromRow(row: TouchedEntityRow): AutomationStudioMutationTouchedEntity { return { mutationId: row.mutation_id, entityKind: row.entity_kind, entityId: row.entity_id, operation: row.operation, revision: row.revision }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function positiveRevision(value: number): number { const revision = Math.trunc(value); if (revision < 1) throw new Error("Revision must be positive."); return revision; }
function stableStringify(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"; if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
