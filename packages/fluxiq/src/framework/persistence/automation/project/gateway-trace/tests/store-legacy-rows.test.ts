// @fluxiq-test-group real-sql
// Rows 0030 wrote, before chunked bodies (lane T P3): an event's JSON inline,
// or in one content object pinned to its trace. A project database holding
// them is migrated by 0031 when the store opens; every such row still reads
// exactly, the trace takes new chunked events after them, and deleting it
// removes its object references too.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent } from "../../../../../../client-gateway/trace/index.ts";
import { correlation, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION } from "../../gateway-trace-schema/index.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../index.ts";

const PROJECT = "project.gateway-trace-legacy";
const TRACE = "trace-legacy";

let rootDir: string;
let pool: AutomationStudioProjectDatabasePool;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-gateway-trace-legacy-test-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
});

afterEach(async () => {
  await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

/** Three events as a recorder delivers them: small, large (one content object under 0030), small. */
async function recordedEvents(): Promise<readonly ClientGatewayTraceEvent[]> {
  const { recorder, store } = newRecorder({}, { traceId: TRACE, episodeId: "run-legacy" });
  recorder.record(textEvent('{"n":1,"absent_vs_null":null}', { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.record(textEvent(JSON.stringify({ body: "<p>".padEnd(300 * 1024, "y") }), { correlation: correlation({ commandId: "cmd-1" }) }));
  recorder.record(textEvent('{"n":3,"e":1E3}'));
  const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
  const events = await store.readEventRange(TRACE, 1, 3);
  await writeLegacyTrace(events, JSON.stringify(manifest));
  return events;
}

/** Writes the trace exactly as 0030's store did, into a database migrated only to 0030. */
async function writeLegacyTrace(events: readonly ClientGatewayTraceEvent[], manifestJson: string): Promise<void> {
  const lease = await pool.acquire(PROJECT);
  const content = await AutomationStudioProjectContentStore.open({ pool, projectId: PROJECT });
  try {
    const migrations = [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION];
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations }).migrate();
    await lease.database.run(
      `insert into client_gateway_traces (trace_id, episode_id, activity, origin_kind, started_at, closed_at, claimed_completeness, manifest_json)
       values (?, 'run-legacy', 'test', 'live', '2026-10-19T10:00:00.000Z', '2026-10-19T10:00:01.000Z', 'complete', ?)`,
      [TRACE, manifestJson]
    );
    for (const event of events) {
      const json = JSON.stringify(event);
      const large = json.length > 256 * 1024;
      const written = large
        ? await content.putBytes({ content: Buffer.from(json, "utf8"), mediaType: "application/json", extension: "json", owner: { ownerKind: "client_gateway_trace", ownerId: TRACE, purpose: "event" } })
        : undefined;
      await lease.database.run(
        `insert into client_gateway_trace_events
           (trace_id, sequence, event_id, stream, kind, message_type, command_id, recording_id, causation_event_id, event_json, event_object_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [TRACE, event.sequence, event.eventId, event.stream, event.kind, event.messageType, event.correlation.commandId, null, null, large ? null : json, written?.object.objectId ?? null]
      );
    }
  } finally {
    await content.close();
    await lease.release();
  }
}

describe("rows written by 0030's layout", () => {
  it("still read exactly after 0031 migrates the database", async () => {
    const events = await recordedEvents();
    const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: PROJECT });
    try {
      const layout = await store.readEventRange(TRACE, 1, 3);
      expect(layout.map((event) => JSON.stringify(event))).toEqual(events.map((event) => JSON.stringify(event)));
      expect((await store.readEventsByCorrelation(TRACE, "commandId", "cmd-1")).map((event) => event.sequence)).toEqual([1, 2]);
      const sizes = events.map((event) => Buffer.byteLength(JSON.stringify(event), "utf8"));
      expect(await store.measureTrace(TRACE)).toMatchObject({
        events: 3,
        logicalEventBytes: sizes[0]! + sizes[1]! + sizes[2]!,
        inlineEvents: 2,
        inlineBytes: sizes[0]! + sizes[2]!,
        objectEvents: 1,
        objectBytes: sizes[1]!,
        chunkedEvents: 0,
        chunks: 0
      });
    } finally {
      await store.close();
    }
    const lease = await pool.acquire(PROJECT);
    try {
      const rows = await lease.database.all<{ inline: number; object: number; chunked: number }>(
        "select event_json is not null as inline, event_object_id is not null as object, event_chunk_digests is not null as chunked from client_gateway_trace_events order by sequence"
      );
      expect(rows).toEqual([{ inline: 1, object: 0, chunked: 0 }, { inline: 0, object: 1, chunked: 0 }, { inline: 1, object: 0, chunked: 0 }]);
    } finally {
      await lease.release();
    }
  });

  it("take new chunked events after them, and are deleted with their object references", async () => {
    const events = await recordedEvents();
    const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: PROJECT });
    try {
      const continued = newRecorder({}, { traceId: TRACE, episodeId: "run-legacy" });
      for (const event of events) continued.recorder.record(textEvent(event.payload.encoding === "text" ? event.payload.text : ""));
      continued.recorder.record(textEvent(JSON.stringify({ body: "<p>".padEnd(64 * 1024, "z") })));
      await continued.recorder.flush();
      const [fourth] = await continued.store.readEventRange(TRACE, 4, 4);
      await store.appendEvents(TRACE, [fourth!]);
      const all = await store.readEventRange(TRACE, 1, 9);
      expect(all.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
      expect(JSON.stringify(all[3])).toBe(JSON.stringify(fourth));
      await store.deleteTrace(TRACE);
      await expect(store.readEventRange(TRACE, 1, 9)).rejects.toThrow(/not in this store/);
    } finally {
      await store.close();
    }
    const lease = await pool.acquire(PROJECT);
    try {
      expect(await lease.database.all("select * from object_references where owner_kind = 'client_gateway_trace'")).toEqual([]);
      expect(await lease.database.all("select * from client_gateway_trace_chunk_uses")).toEqual([]);
      expect(await lease.database.all("select digest from client_gateway_trace_chunks")).toEqual([]);
    } finally {
      await lease.release();
    }
  });
});
