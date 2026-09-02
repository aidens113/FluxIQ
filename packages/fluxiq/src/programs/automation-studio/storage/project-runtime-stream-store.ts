import { createHash } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type {
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowRunRecoveryRecord,
  AutomationStudioFlowRunStatus,
  AutomationStudioFlowRunSummary,
  AutomationStudioFlowIntervention,
  AutomationStudioRouteDecisionRecord,
  AutomationStudioSubflowExecutionRecord,
  RecordingSession,
  StateSnapshot,
  StateValue
} from "../model/index.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import { AutomationStudioProjectEventChunkStore, type AutomationStudioChunkEvent } from "./project-event-chunk-store.ts";
import { automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "./paging.ts";

export type AutomationStudioRuntimeEventKind =
  | "run_summary"
  | "route_decision"
  | "subflow_execution"
  | "action_attempt"
  | "recovery_attempt"
  | "intervention";

export type AutomationStudioRuntimeStreamEvent = {
  sequence: number;
  eventId: string;
  eventKind: AutomationStudioRuntimeEventKind;
  timestampMs: number;
  title: string;
  status?: string;
  entityId?: string;
  payload?: JsonObject;
};

export type AutomationStudioRuntimeEventPage = {
  events: AutomationStudioRuntimeStreamEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  lastSequence: number;
};

export type AutomationStudioProjectRuntimeRunSummaryPage = {
  runs: AutomationStudioFlowRunSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type AutomationStudioProjectFlowRunActionPage = {
  actions: AutomationStudioFlowRunActionAttemptRecord[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type AutomationStudioRecordingSummaryPage = {
  recordings: RecordingSession[];
  total: number;
  limit: number;
  offset: number;
};

export type AutomationStudioStateSnapshotRecord = {
  snapshotId: string;
  sourceKind: "runtime_run" | "recording" | string;
  sourceId: string;
  sequence: number;
  capturedAt: number;
  stateObjectId: string;
  screenshotObjectId: string | null;
  previousSnapshotId: string | null;
  digest: string;
  metadata: JsonObject;
};

export type AutomationStudioStatePathRecord = {
  snapshotId: string;
  namespace: string;
  path: string;
  valueType: string;
  scalarText: string | null;
  scalarNumber: number | null;
  scalarBoolean: boolean | null;
  valueObjectId: string | null;
};

export class AutomationStudioProjectRuntimeStreamStore {
  private constructor(
    private readonly content: AutomationStudioProjectContentStore,
    private readonly chunks: AutomationStudioProjectEventChunkStore,
    private readonly lease: AutomationStudioProjectDatabaseLease
  ) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectRuntimeStreamStore> {
    const content = await AutomationStudioProjectContentStore.open(input);
    try {
      const chunks = await AutomationStudioProjectEventChunkStore.open(input);
      try {
        const lease = await input.pool.acquire(input.projectId);
        return new AutomationStudioProjectRuntimeStreamStore(content, chunks, lease);
      } catch (error) {
        await chunks.close();
        throw error;
      }
    } catch (error) {
      await content.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.lease.release();
    await this.chunks.close();
    await this.content.close();
  }

  async ensureRuntimeFlowProjection(input: { flowId: string; name?: string; now?: number }): Promise<void> {
    const now = input.now ?? Date.now();
    await this.lease.database.run(
      `insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms)
       values (?, ?, 'project', 'project', 'system', 'visual', 'draft', ?, ?)
       on conflict(flow_id) do nothing`,
      [requiredId(input.flowId, "flow"), input.name?.trim() || input.flowId, now, now]
    );
  }

  async upsertRunSummary(summary: AutomationStudioFlowRunSummary): Promise<AutomationStudioFlowRunSummary> {
    await this.lease.database.run(
      `insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, started_at_ms, finished_at_ms, action_count, effect_count, error_count, adaptation_count, last_event_sequence, updated_at_ms, summary_json)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce((select last_event_sequence from runtime_runs where run_id = ?), 0), ?, ?)
       on conflict(run_id) do update set flow_id = excluded.flow_id, status = excluded.status, started_at_ms = excluded.started_at_ms,
         finished_at_ms = excluded.finished_at_ms, action_count = excluded.action_count, error_count = excluded.error_count,
         adaptation_count = excluded.adaptation_count, updated_at_ms = excluded.updated_at_ms, summary_json = excluded.summary_json`,
      [
        requiredId(summary.runId, "run"),
        requiredId(summary.flowId, "flow"),
        positiveInteger(Number(summary.flowVersion) || 1, "flow revision"),
        sqlRuntimeStatus(summary.status),
        String(summary.metadata?.triggerKind ?? "manual"),
        Math.trunc(summary.startedAt ?? summary.updatedAt),
        optionalInteger(summary.startedAt),
        optionalInteger(summary.finishedAt),
        nonNegativeInteger(summary.actionAttemptCount, "action count"),
        nonNegativeInteger(Number(summary.metadata?.effectCount ?? 0), "effect count"),
        summary.status === "failed" ? 1 : 0,
        nonNegativeInteger(summary.adaptationCount, "adaptation count"),
        requiredId(summary.runId, "run"),
        nonNegativeInteger(summary.updatedAt, "updated at"),
        JSON.stringify(summary)
      ]
    );
    return summary;
  }

  async putRunDetail(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail> {
    await this.upsertRunSummary(detail.summary);
    const existing = await this.readAllRuntimeEvents(detail.summary.runId, 5_000);
    const desired = runtimeEventsFromDetail(detail);
    const existingIds = new Set(existing.filter((event) => event.eventKind !== "run_summary").map((event) => event.eventId));
    const latestEnvelope = [...existing].reverse().find((event) => event.eventKind === "run_summary")?.payload;
    const nextEnvelope = desired.find((event) => event.eventKind === "run_summary")?.payload;
    const envelopeChanged = JSON.stringify(latestEnvelope ?? null) !== JSON.stringify(nextEnvelope ?? null);
    const additions = desired.filter((event) => event.eventKind !== "run_summary" && !existingIds.has(event.eventId));
    const summaryEvent = desired.find((event) => event.eventKind === "run_summary");
    const pending = [...(envelopeChanged && summaryEvent ? [summaryEvent] : []), ...additions].map(({ sequence: _sequence, ...event }) => event);
    if (pending.length) await this.appendRuntimeEvents({ runId: detail.summary.runId, events: pending });
    await this.upsertRunSummary(detail.summary);
    return detail;
  }

  async getRunSummary(runId: string): Promise<AutomationStudioFlowRunSummary | null> {
    const row = await this.lease.database.get<RuntimeRunRow>("select * from runtime_runs where run_id = ?", [requiredId(runId, "run")]);
    return row ? runtimeSummaryFromRow(this.lease.projectId, row) : null;
  }

  async listRunSummaries(input: { flowId?: string; status?: string; search?: string; sort?: "updated" | "started" | "duration" | "actions" | "status"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown } = {}): Promise<AutomationStudioProjectRuntimeRunSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 10_000_000, 0);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.flowId) { clauses.push("flow_id = ?"); params.push(requiredId(input.flowId, "flow")); }
    if (input.status) { clauses.push("status = ?"); params.push(sqlRuntimeStatus(input.status as AutomationStudioFlowRunStatus)); }
    if (input.search?.trim()) { clauses.push("(lower(run_id) like ? or lower(flow_id) like ?)"); params.push("%" + input.search.trim().toLowerCase() + "%", "%" + input.search.trim().toLowerCase() + "%"); }
    const where = clauses.length ? "where " + clauses.join(" and ") : "";
    const sort = input.sort ?? "updated";
    const direction = input.direction === "asc" ? "asc" : "desc";
    const orderBy = sort === "started" ? "coalesce(started_at_ms, queued_at_ms)"
      : sort === "duration" ? "coalesce(finished_at_ms, updated_at_ms) - coalesce(started_at_ms, queued_at_ms)"
        : sort === "actions" ? "action_count"
          : sort === "status" ? "status"
            : "updated_at_ms";
    const result = await this.lease.database.transaction(async (sql) => {
      const total = await sql.get<{ total: number }>("select count(*) as total from runtime_runs " + where, params);
      const rows = await sql.all<RuntimeRunRow>("select * from runtime_runs " + where + " order by " + orderBy + " " + direction + ", run_id " + direction + " limit ? offset ?", [...params, limit, offset]);
      return { total: total?.total ?? 0, rows };
    });
    return { runs: result.rows.map((row) => runtimeSummaryFromRow(this.lease.projectId, row)), total: result.total, limit, offset };
  }

  async appendRuntimeEvents(input: { runId: string; events: Array<Omit<AutomationStudioRuntimeStreamEvent, "sequence"> & { sequence?: number }>; maxEvents?: number }): Promise<AutomationStudioRuntimeEventPage> {
    const runId = requiredId(input.runId, "run");
    const firstSequence = await this.getRunLastSequence(runId) + 1;
    const events = normalizeRuntimeEvents(input.events, firstSequence);
    const chunk = await this.chunks.writeChunk({ streamKind: "runtime", streamId: runId, events, maxEvents: input.maxEvents ?? 2_000 });
    await this.projectActionSummaries(runId, events);
    await this.lease.database.run("update runtime_runs set last_event_sequence = ?, action_count = action_count + ?, updated_at_ms = ? where run_id = ?", [chunk.lastSequence, events.filter((event) => event.eventKind === "action_attempt").length, Date.now(), runId]);
    return { events, nextCursor: String(chunk.lastSequence), hasMore: false, lastSequence: chunk.lastSequence };
  }

  async listRuntimeEvents(input: { runId: string; afterSequence?: unknown; limit?: unknown; includePayload?: boolean }): Promise<AutomationStudioRuntimeEventPage> {
    const afterSequence = clampInteger(input.afterSequence, 0, 10_000_000_000, 0);
    const page = await this.chunks.readEventsBySequence({ streamKind: "runtime", streamId: requiredId(input.runId, "run"), afterSequence, limit: clampInteger(input.limit, 1, 500, 100) });
    const events = page.events.map((event) => runtimeEventFromChunk(event, input.includePayload !== false));
    return { events, nextCursor: page.nextCursor, hasMore: page.hasMore, lastSequence: events.at(-1)?.sequence ?? afterSequence };
  }

  async getRuntimeEventDetail(input: { runId: string; sequence: unknown }): Promise<AutomationStudioRuntimeStreamEvent | null> {
    const sequence = clampInteger(input.sequence, 1, 10_000_000_000, 1);
    const page = await this.chunks.readEventsBySequence({ streamKind: "runtime", streamId: requiredId(input.runId, "run"), afterSequence: sequence - 1, limit: 1 });
    const event = page.events.find((item) => Math.trunc(item.sequence) === sequence);
    return event ? runtimeEventFromChunk(event, true) : null;
  }

  async getRunDetail(runId: string, options: { includeCollections?: boolean } = {}): Promise<AutomationStudioFlowRunDetail | null> {
    const summary = await this.getRunSummary(runId);
    if (!summary) return null;
    const events = await this.readAllRuntimeEvents(runId, 5_000);
    if (!events.some((event) => event.eventKind === "run_summary")) return null;
    if (options.includeCollections === false) {
      const envelopeEvent = [...events].reverse().find((event) => event.eventKind === "run_summary");
      const envelope = compactJsonObject(envelopeEvent?.payload) as Partial<AutomationStudioFlowRunDetail>;
      return {
        schemaVersion: "0.1",
        ...envelope,
        summary,
        routeDecisions: [],
        subflows: [],
        actionAttempts: [],
        recoveryAttempts: [],
        interventions: [],
        adaptationIds: Array.isArray(envelope.adaptationIds) ? envelope.adaptationIds : [],
        changeProposalIds: Array.isArray(envelope.changeProposalIds) ? envelope.changeProposalIds : [],
        metadata: { ...compactJsonObject(envelope.metadata), collectionsPaged: true, eventStream: { lastSequence: Number(summary.metadata?.lastEventSequence ?? 0) } }
      };
    }
    return runDetailFromEvents(summary, events);
  }

  async listRunActions(input: { runId: string; limit?: unknown; offset?: unknown; cursor?: unknown }): Promise<AutomationStudioProjectFlowRunActionPage> {
    const runId = requiredId(input.runId, "run");
    const limit = automationStudioPageLimit(input.limit, 50);
    await this.ensureActionSummaryProjection(runId);
    const owner = `run-actions:${runId}`;
    const filterHash = automationStudioFilterHash({});
    const cursor = decodeAutomationStudioPageCursor<{ sequence: number; attemptId: string }>(input.cursor, { owner, filterHash, validate: (values) => Number.isSafeInteger(values.sequence) && Number(values.sequence) > 0 && typeof values.attemptId === "string" });
    const offset = cursor ? 0 : clampInteger(input.offset, 0, 10_000_000, 0);
    const where = ["run_id = ?"];
    const params: unknown[] = [runId];
    if (cursor) { where.push("(sequence > ? or (sequence = ? and attempt_id > ?))"); params.push(cursor.sequence, cursor.sequence, cursor.attemptId); }
    const [totalRow, rows] = await Promise.all([
      this.lease.database.get<{ total: number }>("select count(*) as total from runtime_action_summaries where run_id = ?", [runId]),
      this.lease.database.all<RuntimeActionSummaryRow>(`select run_id, sequence, attempt_id, node_id, definition_id, status, route, comparison_status, message_summary, started_at_ms, finished_at_ms, duration_ms, evidence_count, error_summary from runtime_action_summaries where ${where.join(" and ")} order by sequence, attempt_id limit ? offset ?`, [...params, limit + 1, offset])
    ]);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      actions: pageRows.map(actionSummaryFromRow),
      total: totalRow?.total ?? 0,
      limit,
      offset,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { sequence: last.sequence, attemptId: last.attempt_id } }) : null
    };
  }

  async getRunActionDetail(input: { runId: string; attemptId: string }): Promise<AutomationStudioFlowRunActionAttemptRecord | null> {
    const runId = requiredId(input.runId, "run");
    await this.ensureActionSummaryProjection(runId);
    const row = await this.lease.database.get<{ detail_json: string }>("select detail_json from runtime_action_summaries where run_id = ? and attempt_id = ?", [runId, requiredId(input.attemptId, "action attempt")]);
    return row ? JSON.parse(row.detail_json) as AutomationStudioFlowRunActionAttemptRecord : null;
  }

  async upsertRecordingSummary(recording: RecordingSession): Promise<RecordingSession> {
    const summary = recordingSummary(recording);
    await this.lease.database.run(
      `insert into recordings (recording_id, name, task_id, domain_id, status, started_at_ms, ended_at_ms, event_count, action_count, state_snapshot_count, updated_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(recording_id) do update set name = excluded.name, task_id = excluded.task_id, domain_id = excluded.domain_id,
         status = excluded.status, ended_at_ms = excluded.ended_at_ms, event_count = excluded.event_count,
         action_count = excluded.action_count, state_snapshot_count = excluded.state_snapshot_count, updated_at_ms = excluded.updated_at_ms`,
      [summary.recordingId, summary.name, summary.taskId ?? null, summary.domainId ?? null, summary.status, summary.startedAt, summary.endedAt ?? null, summary.eventCount, summary.actionCount, summary.stateSnapshotCount, summary.updatedAt]
    );
    return recording;
  }

  async putRecording(recording: RecordingSession): Promise<RecordingSession> {
    await this.upsertRecordingSummary(recording);
    const row = await this.lease.database.get<{ last_sequence: number | null }>("select max(last_sequence) as last_sequence from recording_event_chunks where recording_id = ?", [requiredId(recording.recordingId, "recording")]);
    if ((row?.last_sequence ?? 0) === 0 && recording.timeline.length) {
      await this.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.map((entry, index) => ({ ...entry, sequence: index + 1 } as AutomationStudioChunkEvent)) });
      await this.upsertRecordingSummary(recording);
    }
    await this.putStateSnapshot({ sourceKind: "recording", sourceId: recording.recordingId, sequence: 0, snapshot: recording.initialState, metadata: { phase: "initial" } });
    return recording;
  }

  async listRecordingSummaries(input: { limit?: unknown; offset?: unknown } = {}): Promise<AutomationStudioRecordingSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 10_000_000, 0);
    const result = await this.lease.database.transaction(async (sql) => {
      const total = await sql.get<{ total: number }>("select count(*) as total from recordings");
      const rows = await sql.all<RecordingRow>("select * from recordings order by started_at_ms desc, recording_id desc limit ? offset ?", [limit, offset]);
      return { total: total?.total ?? 0, rows };
    });
    return { recordings: result.rows.map(recordingFromRow), total: result.total, limit, offset };
  }

  async appendRecordingEvents(input: { recordingId: string; events: AutomationStudioChunkEvent[]; maxEvents?: number }): Promise<{ nextCursor: string | null; lastSequence: number }> {
    const recordingId = requiredId(input.recordingId, "recording");
    const row = await this.lease.database.get<{ last_sequence: number | null }>("select max(last_sequence) as last_sequence from recording_event_chunks where recording_id = ?", [recordingId]);
    const events = normalizeGenericEvents(input.events, (row?.last_sequence ?? 0) + 1);
    const chunk = await this.chunks.writeChunk({ streamKind: "recording", streamId: recordingId, events, maxEvents: input.maxEvents ?? 2_000 });
    await this.lease.database.run("update recordings set event_count = event_count + ?, action_count = action_count + ?, state_snapshot_count = state_snapshot_count + ?, updated_at_ms = ? where recording_id = ?", [events.length, events.filter(recordingEventIsActionLike).length, events.filter(recordingEventIsStateSnapshotLike).length, Date.now(), recordingId]);
    return { nextCursor: String(chunk.lastSequence), lastSequence: chunk.lastSequence };
  }

  async listRecordingEvents(input: { recordingId: string; afterSequence?: unknown; limit?: unknown }): Promise<{ events: AutomationStudioChunkEvent[]; nextCursor: string | null; hasMore: boolean; lastSequence: number }> {
    const afterSequence = clampInteger(input.afterSequence, 0, 10_000_000_000, 0);
    const page = await this.chunks.readEventsBySequence({ streamKind: "recording", streamId: requiredId(input.recordingId, "recording"), afterSequence, limit: clampInteger(input.limit, 1, 500, 100) });
    return { events: page.events, nextCursor: page.nextCursor, hasMore: page.hasMore, lastSequence: page.events.at(-1)?.sequence ?? afterSequence };
  }

  async putStateSnapshot(input: { sourceKind: string; sourceId: string; sequence: number; snapshot: StateSnapshot; previousSnapshotId?: string | null; screenshotObjectId?: string | null; metadata?: JsonObject }): Promise<AutomationStudioStateSnapshotRecord> {
    const sourceKind = requiredId(input.sourceKind, "state source kind");
    const sourceId = requiredId(input.sourceId, "state source");
    const sequence = nonNegativeInteger(input.sequence, "state sequence");
    const snapshotId = input.snapshot.id ?? `state:${sourceKind}:${sourceId}:${sequence}`;
    const body = Buffer.from(JSON.stringify(input.snapshot), "utf8");
    const digest = createHash("sha256").update(body).digest("hex");
    const object = await this.content.putBytes({ content: body, mediaType: "application/vnd.fluxiq.automation-state+json", extension: "json", owner: { ownerKind: "state_snapshot", ownerId: snapshotId, purpose: "state_body" } });
    const metadata = input.metadata ?? {};
    await this.lease.database.transaction(async (sql) => {
      await sql.run(
        `insert into state_snapshots (snapshot_id, source_kind, source_id, sequence, captured_at_ms, state_object_id, screenshot_object_id, previous_snapshot_id, digest, metadata_json)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(snapshot_id) do update set state_object_id = excluded.state_object_id, screenshot_object_id = excluded.screenshot_object_id,
           previous_snapshot_id = excluded.previous_snapshot_id, digest = excluded.digest, metadata_json = excluded.metadata_json`,
        [snapshotId, sourceKind, sourceId, sequence, nonNegativeInteger(input.snapshot.timestamp, "state timestamp"), object.object.objectId, input.screenshotObjectId ?? null, input.previousSnapshotId ?? null, digest, JSON.stringify(metadata)]
      );
      await sql.run("delete from state_paths where snapshot_id = ?", [snapshotId]);
      for (const row of statePathsFromSnapshot(snapshotId, input.snapshot)) {
        await sql.run(
          `insert into state_paths (snapshot_id, namespace, path, value_type, scalar_text, scalar_number, scalar_boolean, value_object_id)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.snapshotId, row.namespace, row.path, row.valueType, row.scalarText, row.scalarNumber, row.scalarBoolean === null ? null : row.scalarBoolean ? 1 : 0, row.valueObjectId]
        );
      }
    });
    return { snapshotId, sourceKind, sourceId, sequence, capturedAt: input.snapshot.timestamp, stateObjectId: object.object.objectId, screenshotObjectId: input.screenshotObjectId ?? null, previousSnapshotId: input.previousSnapshotId ?? null, digest, metadata };
  }

  async getStateSnapshot(input: { snapshotId: string; includeState?: boolean }): Promise<{ record: AutomationStudioStateSnapshotRecord; state?: StateSnapshot; paths: AutomationStudioStatePathRecord[] } | null> {
    const row = await this.lease.database.get<StateSnapshotRow>("select * from state_snapshots where snapshot_id = ?", [requiredId(input.snapshotId, "state snapshot")]);
    if (!row) return null;
    const paths = await this.listStatePaths({ snapshotId: row.snapshot_id, limit: 500 });
    const record = stateSnapshotFromRow(row);
    if (!input.includeState) return { record, paths };
    const object = await this.content.readBytesBySha256(record.stateObjectId.replace(/^object:/, ""));
    return { record, state: JSON.parse(object.content.toString("utf8")) as StateSnapshot, paths };
  }

  async listStatePaths(input: { snapshotId?: string; namespace?: string; path?: string; valueType?: string; limit?: unknown } = {}): Promise<AutomationStudioStatePathRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.snapshotId) { clauses.push("snapshot_id = ?"); params.push(requiredId(input.snapshotId, "state snapshot")); }
    if (input.namespace) { clauses.push("namespace = ?"); params.push(input.namespace); }
    if (input.path) { clauses.push("path = ?"); params.push(input.path); }
    if (input.valueType) { clauses.push("value_type = ?"); params.push(input.valueType); }
    const rows = await this.lease.database.all<StatePathRow>("select * from state_paths" + (clauses.length ? " where " + clauses.join(" and ") : "") + " order by namespace, path limit ?", [...params, clampInteger(input.limit, 1, 500, 100)]);
    return rows.map(statePathFromRow);
  }

  private async getRunLastSequence(runId: string): Promise<number> {
    const row = await this.lease.database.get<{ last_event_sequence: number }>("select last_event_sequence from runtime_runs where run_id = ?", [requiredId(runId, "run")]);
    return row?.last_event_sequence ?? 0;
  }

  private async readAllRuntimeEvents(runId: string, maxEvents: number): Promise<AutomationStudioRuntimeStreamEvent[]> {
    const events: AutomationStudioRuntimeStreamEvent[] = [];
    let afterSequence = 0;
    while (events.length < maxEvents) {
      const page = await this.listRuntimeEvents({ runId, afterSequence, limit: Math.min(500, maxEvents - events.length) });
      events.push(...page.events);
      if (!page.hasMore || page.lastSequence <= afterSequence) break;
      afterSequence = page.lastSequence;
    }
    return events;
  }

  private async projectActionSummaries(runId: string, events: AutomationStudioRuntimeStreamEvent[]): Promise<void> {
    const actions = events.filter((event) => event.eventKind === "action_attempt" && event.payload);
    if (!actions.length) return;
    const rows = actions.map((event) => {
      const action = event.payload as unknown as AutomationStudioFlowRunActionAttemptRecord;
      const finishedAt = optionalInteger(action.finishedAt);
      const startedAt = nonNegativeInteger(action.startedAt, "action started at");
      const evidenceCount = Array.isArray((action as any).evidence) ? (action as any).evidence.length : Array.isArray((action as any).effects) ? (action as any).effects.length : 0;
      const messageSummary = typeof action.message === "string" ? action.message.slice(0, 1_000) : null;
      const errorSummary = action.status === "failed" ? messageSummary : null;
      const durationMs = optionalInteger(action.durationMs) ?? (finishedAt === null ? null : Math.max(0, finishedAt - startedAt));
      return [runId, event.sequence, requiredId(action.attemptId, "action attempt"), requiredId(action.nodeId, "action node"), requiredId(action.definitionId, "action definition"), String(action.status ?? "unknown"), action.route ?? null, action.comparisonStatus ?? null, messageSummary, startedAt, finishedAt, durationMs, evidenceCount, errorSummary, JSON.stringify(action)] as const;
    });
    await this.lease.database.transaction(async (sql) => {
      for (let offset = 0; offset < rows.length; offset += 200) {
        const batch = rows.slice(offset, offset + 200);
        const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        await sql.run(`insert into runtime_action_summaries (run_id, sequence, attempt_id, node_id, definition_id, status, route, comparison_status, message_summary, started_at_ms, finished_at_ms, duration_ms, evidence_count, error_summary, detail_json)
          values ${values}
          on conflict(run_id, attempt_id) do update set sequence = excluded.sequence, node_id = excluded.node_id, definition_id = excluded.definition_id, status = excluded.status, route = excluded.route, comparison_status = excluded.comparison_status, message_summary = excluded.message_summary, started_at_ms = excluded.started_at_ms, finished_at_ms = excluded.finished_at_ms, duration_ms = excluded.duration_ms, evidence_count = excluded.evidence_count, error_summary = excluded.error_summary, detail_json = excluded.detail_json`,
        batch.flat());
      }
    });
  }

  private async ensureActionSummaryProjection(runId: string): Promise<void> {
    const [summaryCount, run] = await Promise.all([
      this.lease.database.get<{ total: number; incomplete: number }>("select count(*) as total, sum(case when definition_id = 'unknown' or trim(definition_id) = '' then 1 else 0 end) as incomplete from runtime_action_summaries where run_id = ?", [runId]),
      this.lease.database.get<{ action_count: number }>("select action_count from runtime_runs where run_id = ?", [runId])
    ]);
    if ((summaryCount?.total ?? 0) >= (run?.action_count ?? 0) && (summaryCount?.incomplete ?? 0) === 0) return;
    let afterSequence = 0;
    for (;;) {
      const page = await this.listRuntimeEvents({ runId, afterSequence, limit: 500, includePayload: true });
      await this.projectActionSummaries(runId, page.events);
      if (!page.hasMore || page.lastSequence <= afterSequence) break;
      afterSequence = page.lastSequence;
    }
  }
}

type RuntimeRunRow = { run_id: string; flow_id: string; flow_revision: number; status: AutomationStudioFlowRunStatus; queued_at_ms: number; started_at_ms: number | null; finished_at_ms: number | null; action_count: number; effect_count: number; error_count: number; adaptation_count: number; last_event_sequence: number; updated_at_ms: number; summary_json: string };
type RuntimeActionSummaryRow = { run_id: string; sequence: number; attempt_id: string; node_id: string; definition_id: string; status: string; route: string | null; comparison_status: string | null; message_summary: string | null; started_at_ms: number; finished_at_ms: number | null; duration_ms: number | null; evidence_count: number; error_summary: string | null };
type RecordingRow = { recording_id: string; name: string; task_id: string | null; domain_id: string | null; status: string; started_at_ms: number; ended_at_ms: number | null; event_count: number; action_count: number; state_snapshot_count: number; updated_at_ms: number };
type StateSnapshotRow = { snapshot_id: string; source_kind: string; source_id: string; sequence: number; captured_at_ms: number; state_object_id: string | null; screenshot_object_id: string | null; previous_snapshot_id: string | null; digest: string; metadata_json: string };
type StatePathRow = { snapshot_id: string; namespace: string; path: string; value_type: string; scalar_text: string | null; scalar_number: number | null; scalar_boolean: number | null; value_object_id: string | null };
type RuntimeEventCandidate = Omit<AutomationStudioRuntimeStreamEvent, "sequence" | "payload"> & { order: number; payload: JsonObject };

function runtimeEventsFromDetail(detail: AutomationStudioFlowRunDetail): AutomationStudioRuntimeStreamEvent[] {
  const candidates: RuntimeEventCandidate[] = [
    runtimeEvent("run_summary", detail.summary.runId, detail.summary.startedAt ?? detail.summary.updatedAt, "Run summary", detail.summary.status, detail.summary.runId, runDetailEnvelope(detail), 0),
    ...detail.routeDecisions.map((record, index) => runtimeEvent("route_decision", record.decisionId, record.decidedAt, "Route decision", record.selectedRuleId ?? "evaluated", record.routerId, record as unknown as JsonObject, 100_000 + index)),
    ...detail.subflows.map((record, index) => runtimeEvent("subflow_execution", record.entryId, record.enteredAt, "Subflow execution", record.status, record.subflowId, record as unknown as JsonObject, 200_000 + index)),
    ...(detail.actionAttempts ?? []).map((record, index) => runtimeEvent("action_attempt", record.attemptId, record.startedAt, record.nodeId, record.status, record.attemptId, record as unknown as JsonObject, record.order ?? 300_000 + index)),
    ...(detail.recoveryAttempts ?? []).map((record, index) => runtimeEvent("recovery_attempt", record.recoveryId, record.createdAt, "Recovery attempt", record.status, record.recoveryId, record as unknown as JsonObject, 400_000 + index)),
    ...detail.interventions.map((record, index) => runtimeEvent("intervention", record.interventionId, record.createdAt, record.kind, record.validation?.ok === false ? "failed" : "created", record.interventionId, record as unknown as JsonObject, 500_000 + index))
  ];
  return candidates.sort((left, right) => left.timestampMs - right.timestampMs || left.order - right.order || left.eventId.localeCompare(right.eventId)).map((event, index) => ({
    eventId: event.eventId,
    eventKind: event.eventKind,
    timestampMs: event.timestampMs,
    title: event.title,
    ...(event.status !== undefined ? { status: event.status } : {}),
    ...(event.entityId !== undefined ? { entityId: event.entityId } : {}),
    payload: event.payload,
    sequence: index + 1
  }));
}

function runtimeEvent(kind: AutomationStudioRuntimeEventKind, id: string, timestampMs: number, title: string, status: string | undefined, entityId: string | undefined, payload: JsonObject, order: number): RuntimeEventCandidate {
  return { eventId: `${kind}:${id}`, eventKind: kind, timestampMs: nonNegativeInteger(timestampMs, "event timestamp"), title, ...(status !== undefined ? { status } : {}), ...(entityId !== undefined ? { entityId } : {}), payload, order };
}

function runDetailFromEvents(summary: AutomationStudioFlowRunSummary, events: AutomationStudioRuntimeStreamEvent[]): AutomationStudioFlowRunDetail {
  const envelope = compactJsonObject([...events].reverse().find((event) => event.eventKind === "run_summary")?.payload) as Partial<AutomationStudioFlowRunDetail>;
  const actions = new Map<string, AutomationStudioFlowRunActionAttemptRecord>();
  const routeDecisions = new Map<string, AutomationStudioRouteDecisionRecord>();
  const subflows = new Map<string, AutomationStudioSubflowExecutionRecord>();
  const recoveryAttempts = new Map<string, AutomationStudioFlowRunRecoveryRecord>();
  const interventions = new Map<string, AutomationStudioFlowIntervention>();
  for (const event of events) {
    if (event.eventKind === "action_attempt" && event.payload) { const item = event.payload as unknown as AutomationStudioFlowRunActionAttemptRecord; actions.set(item.attemptId, item); }
    else if (event.eventKind === "route_decision" && event.payload) { const item = event.payload as unknown as AutomationStudioRouteDecisionRecord; routeDecisions.set(item.decisionId, item); }
    else if (event.eventKind === "subflow_execution" && event.payload) { const item = event.payload as unknown as AutomationStudioSubflowExecutionRecord; subflows.set(item.entryId, item); }
    else if (event.eventKind === "recovery_attempt" && event.payload) { const item = event.payload as unknown as AutomationStudioFlowRunRecoveryRecord; recoveryAttempts.set(item.recoveryId, item); }
    else if (event.eventKind === "intervention" && event.payload) { const item = event.payload as unknown as AutomationStudioFlowIntervention; interventions.set(item.interventionId, item); }
  }
  return {
    schemaVersion: "0.1",
    ...envelope,
    summary,
    routeDecisions: [...routeDecisions.values()],
    subflows: [...subflows.values()],
    actionAttempts: [...actions.values()],
    recoveryAttempts: [...recoveryAttempts.values()],
    interventions: [...interventions.values()],
    adaptationIds: Array.isArray(envelope.adaptationIds) ? envelope.adaptationIds : [],
    changeProposalIds: Array.isArray(envelope.changeProposalIds) ? envelope.changeProposalIds : [],
    metadata: { ...(compactJsonObject(envelope.metadata)), eventStream: { lastSequence: events.at(-1)?.sequence ?? 0, eventCount: events.length } }
  };
}

function runDetailEnvelope(detail: AutomationStudioFlowRunDetail): JsonObject {
  return compactJsonObject({
    schemaVersion: detail.schemaVersion,
    summary: detail.summary,
    inputs: detail.inputs,
    startingStateRefs: detail.startingStateRefs,
    adaptationIds: detail.adaptationIds,
    changeProposalIds: detail.changeProposalIds,
    evidence: detail.evidence,
    metadata: detail.metadata
  });
}

function normalizeRuntimeEvents(events: Array<Omit<AutomationStudioRuntimeStreamEvent, "sequence"> & { sequence?: number }>, firstSequence: number): AutomationStudioRuntimeStreamEvent[] {
  return events.map((event, index) => ({
    eventId: String(event.eventId),
    eventKind: isRuntimeEventKind(event.eventKind) ? event.eventKind : "run_summary",
    timestampMs: nonNegativeInteger(event.timestampMs, "event timestamp"),
    title: String(event.title),
    ...(event.status !== undefined ? { status: String(event.status) } : {}),
    ...(event.entityId !== undefined ? { entityId: String(event.entityId) } : {}),
    payload: compactJsonObject(event.payload),
    sequence: event.sequence === undefined ? firstSequence + index : Math.trunc(event.sequence)
  }));
}

function normalizeGenericEvents(events: AutomationStudioChunkEvent[], firstSequence: number): AutomationStudioChunkEvent[] {
  return events.map((event, index) => ({ ...event, sequence: event.sequence === undefined ? firstSequence + index : Math.trunc(event.sequence) }));
}

function runtimeEventFromChunk(event: AutomationStudioChunkEvent, includePayload = true): AutomationStudioRuntimeStreamEvent {
  return {
    sequence: Math.trunc(event.sequence),
    eventId: String(event.eventId ?? `event:${event.sequence}`),
    eventKind: isRuntimeEventKind(event.eventKind) ? event.eventKind : "run_summary",
    timestampMs: nonNegativeInteger(Number(event.timestampMs ?? event.timestamp ?? 0), "event timestamp"),
    title: String(event.title ?? event.eventKind ?? "Runtime event"),
    ...(typeof event.status === "string" ? { status: event.status } : {}),
    ...(typeof event.entityId === "string" ? { entityId: event.entityId } : {}),
    ...(includePayload ? { payload: compactJsonObject(event.payload) } : {})
  };
}

function actionSummaryFromRow(row: RuntimeActionSummaryRow): AutomationStudioFlowRunActionAttemptRecord {
  return {
    attemptId: row.attempt_id,
    nodeId: row.node_id,
    definitionId: row.definition_id,
    order: row.sequence,
    status: row.status as AutomationStudioFlowRunActionAttemptRecord["status"],
    startedAt: row.started_at_ms,
    ...(row.route !== null ? { route: row.route } : {}),
    ...(row.finished_at_ms !== null ? { finishedAt: row.finished_at_ms } : {}),
    ...(row.duration_ms !== null ? { durationMs: row.duration_ms } : {}),
    ...(row.comparison_status !== null ? { comparisonStatus: row.comparison_status } : {}),
    metadata: { summaryOnly: true, eventSequence: row.sequence, durationMs: row.duration_ms, evidenceCount: row.evidence_count },
    ...(row.message_summary ?? row.error_summary ? { message: row.message_summary ?? row.error_summary ?? undefined } : {})
  } as unknown as AutomationStudioFlowRunActionAttemptRecord;
}

function runtimeSummaryFromRow(projectId: string, row: RuntimeRunRow): AutomationStudioFlowRunSummary {
  const persisted = parseJsonObject(row.summary_json) as Partial<AutomationStudioFlowRunSummary>;
  return { schemaVersion: "0.1", ...persisted, runId: row.run_id, flowId: row.flow_id, projectId, flowVersion: String(row.flow_revision), status: row.status, ...(row.started_at_ms !== null ? { startedAt: row.started_at_ms } : {}), ...(row.finished_at_ms !== null ? { finishedAt: row.finished_at_ms } : {}), updatedAt: row.updated_at_ms, routeDecisionCount: persisted.routeDecisionCount ?? 0, subflowEntryCount: persisted.subflowEntryCount ?? 0, actionAttemptCount: row.action_count, interventionCount: persisted.interventionCount ?? 0, adaptationCount: row.adaptation_count, metadata: { ...compactJsonObject(persisted.metadata), effectCount: row.effect_count, errorCount: row.error_count, lastEventSequence: row.last_event_sequence } };
}

function recordingSummary(recording: RecordingSession): { recordingId: string; name: string; taskId?: string; domainId?: string; status: string; startedAt: number; endedAt?: number; eventCount: number; actionCount: number; stateSnapshotCount: number; updatedAt: number } {
  return { recordingId: requiredId(recording.recordingId, "recording"), name: String(recording.metadata?.name ?? recording.recordingId), ...(recording.taskId ? { taskId: recording.taskId } : {}), ...(typeof recording.metadata?.domainId === "string" ? { domainId: recording.metadata.domainId } : {}), status: recording.endedAt ? "completed" : "recording", startedAt: recording.startedAt, ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}), eventCount: recording.timeline.length, actionCount: recording.timeline.filter(recordingEventIsActionLike).length, stateSnapshotCount: recording.timeline.filter(recordingEventIsStateSnapshotLike).length, updatedAt: Math.max(recording.endedAt ?? 0, recording.timeline.at(-1)?.timestamp ?? 0, recording.startedAt) };
}

function recordingFromRow(row: RecordingRow): RecordingSession {
  return { schemaVersion: "0.1", recordingId: row.recording_id, ...(row.task_id ? { taskId: row.task_id } : {}), startedAt: row.started_at_ms, ...(row.ended_at_ms !== null ? { endedAt: row.ended_at_ms } : {}), environment: { id: row.domain_id ?? "unknown", kind: "browser", label: row.domain_id ?? "Unknown" }, sources: [], actionChannels: [], initialState: { timestamp: row.started_at_ms, namespaces: {} }, timeline: [], notes: [], metadata: { name: row.name, summaryOnly: true, eventCount: row.event_count, actionCount: row.action_count, stateSnapshotCount: row.state_snapshot_count, updatedAt: row.updated_at_ms, ...(row.domain_id ? { domainId: row.domain_id } : {}) } };
}

function statePathsFromSnapshot(snapshotId: string, snapshot: StateSnapshot): AutomationStudioStatePathRecord[] {
  const rows: AutomationStudioStatePathRecord[] = [];
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces ?? {})) {
    for (const [path, value] of Object.entries(stateNamespace.values ?? {})) rows.push(statePathFromValue(snapshotId, namespace, path, value));
  }
  return rows;
}

function statePathFromValue(snapshotId: string, namespace: string, path: string, value: StateValue): AutomationStudioStatePathRecord {
  const result: AutomationStudioStatePathRecord = { snapshotId, namespace, path, valueType: value.type, scalarText: null, scalarNumber: null, scalarBoolean: null, valueObjectId: null };
  if (typeof value.value === "string") result.scalarText = value.value;
  else if (typeof value.value === "number") result.scalarNumber = value.value;
  else if (typeof value.value === "boolean") result.scalarBoolean = value.value;
  else result.scalarText = JSON.stringify(value.value).slice(0, 2048);
  return result;
}

function stateSnapshotFromRow(row: StateSnapshotRow): AutomationStudioStateSnapshotRecord {
  return { snapshotId: row.snapshot_id, sourceKind: row.source_kind, sourceId: row.source_id, sequence: row.sequence, capturedAt: row.captured_at_ms, stateObjectId: row.state_object_id ?? "", screenshotObjectId: row.screenshot_object_id, previousSnapshotId: row.previous_snapshot_id, digest: row.digest, metadata: parseJsonObject(row.metadata_json) };
}

function statePathFromRow(row: StatePathRow): AutomationStudioStatePathRecord {
  return { snapshotId: row.snapshot_id, namespace: row.namespace, path: row.path, valueType: row.value_type, scalarText: row.scalar_text, scalarNumber: row.scalar_number, scalarBoolean: row.scalar_boolean === null ? null : row.scalar_boolean === 1, valueObjectId: row.value_object_id };
}

function isRuntimeEventKind(value: unknown): value is AutomationStudioRuntimeEventKind { return value === "run_summary" || value === "route_decision" || value === "subflow_execution" || value === "action_attempt" || value === "recovery_attempt" || value === "intervention"; }
function recordingEventIsActionLike(event: unknown): boolean { const value = event as { type?: unknown; actionType?: unknown; eventType?: unknown }; return value.type === "action" || value.type === "domain_event" || typeof value.actionType === "string" || typeof value.eventType === "string"; }
function recordingEventIsStateSnapshotLike(event: unknown): boolean { const value = event as { type?: unknown; observationType?: unknown }; return value.type === "state_checkpoint" || value.observationType === "client.state_snapshot"; }
function sqlRuntimeStatus(status: AutomationStudioFlowRunStatus): "queued" | "running" | "succeeded" | "failed" | "cancelled" { return status === "waiting" ? "running" : status; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function positiveInteger(value: number, label: string): number { const normalized = Math.trunc(value); if (!Number.isFinite(normalized) || normalized < 1) throw new Error(`${label} must be a positive integer.`); return normalized; }
function nonNegativeInteger(value: unknown, label: string): number { const normalized = Math.trunc(Number(value)); if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be a non-negative integer.`); return normalized; }
function optionalInteger(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null; }
function clampInteger(value: unknown, min: number, max: number, fallback: number): number { const normalized = Math.trunc(Number(value)); if (!Number.isFinite(normalized)) return fallback; return Math.max(min, Math.min(max, normalized)); }
function compactJsonObject(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function parseJsonObject(value: string): JsonObject { try { return compactJsonObject(JSON.parse(value)); } catch { return {}; } }
