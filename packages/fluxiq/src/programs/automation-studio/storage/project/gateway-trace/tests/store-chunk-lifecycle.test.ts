// @fluxiq-test-group real-sql
// Lane T P3-E: gateway trace chunks share the project content lifecycle. The
// retention sweep that frees unreferenced content objects also frees chunks no
// trace uses, and keeps every chunk a trace still uses; deleting a project
// removes its traces' events, manifests, chunk uses and chunks together with
// its content objects, and leaves other projects' traces whole.
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStoreWriter } from "../../../../../../client-gateway/trace/index.ts";
import { newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { removeAutomationStudioProjectFiles } from "../../../../runtime/service/projects/index.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectRetentionStore } from "../../retention-store.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../index.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

const OTHER_PROJECT = "project.gateway-trace-other";

let fixture: SqliteTraceFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function protection(): AutomationStudioAesGcmProjectContentProtection {
  return new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "key.1", key: Buffer.alloc(32, 3) }));
}

/** Serialized records, about `count` * 70 bytes. */
function records(count: number, salt: string): string {
  const items: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const word = createHash("sha256").update(`${salt}:${index}`).digest("hex").slice(0, 16);
    items.push(`{"id":"e${index}","label":"Item ${word}","stock":${index % 89}}`);
  }
  return `{"type":"client.state_update","entries":[${items.join(",")}]}`;
}

async function recordTexts(store: AutomationStudioProjectGatewayTraceStore, traceId: string, texts: readonly string[]): Promise<ClientGatewayTraceEvent[]> {
  const written: ClientGatewayTraceEvent[] = [];
  const writer: ClientGatewayTraceStoreWriter = {
    writeArtifact: (id, artifactId, bytes) => store.writeArtifact(id, artifactId, bytes),
    appendEvents: async (id, events) => {
      await store.appendEvents(id, events);
      written.push(...events);
    },
    writeManifest: (manifest) => store.writeManifest(manifest)
  };
  const { recorder } = newRecorder({ store: writer }, { traceId, episodeId: `run-${traceId}` });
  for (const text of texts) recorder.record(textEvent(text));
  await recorder.close({ terminationReason: "completed", terminationDetail: null });
  return written;
}

async function count(current: SqliteTraceFixture, table: string): Promise<number> {
  const [row] = await current.rows<{ count: number }>(`select count(*) as count from ${table}`);
  return row?.count ?? -1;
}

async function exists(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null)) !== null;
}

describe("gateway trace chunks in the project content lifecycle", () => {
  it("frees in the retention sweep the chunks no trace uses, and keeps the ones a trace uses", async () => {
    fixture = await SqliteTraceFixture.create({ protection: protection() });
    const shared = records(6_000, "shared");
    const kept = await recordTexts(fixture.store, "trace-kept", [shared]);
    const keptChunks = await count(fixture, "client_gateway_trace_chunks");
    await recordTexts(fixture.store, "trace-gone", [shared, records(6_000, "only-gone")]);
    const allChunks = await count(fixture, "client_gateway_trace_chunks");
    expect(allChunks - keptChunks).toBeGreaterThan(10);
    // The trace's rows are gone but its chunk uses were left behind, as by a removal that did not go through deleteTrace.
    await fixture.sql("delete from client_gateway_trace_events where trace_id = 'trace-gone'");
    await fixture.sql("delete from client_gateway_traces where trace_id = 'trace-gone'");
    expect(await count(fixture, "client_gateway_trace_chunks")).toBe(allChunks);

    const retention = await AutomationStudioProjectRetentionStore.open({ pool: fixture.databasePool, projectId: SqliteTraceFixture.projectId });
    try {
      const swept = await retention.sweepUnreferencedObjects({ limit: 1_000 });
      const chunkIds = swept.deleted.filter((id) => id.startsWith("gateway-trace-chunk:"));
      expect(chunkIds).toHaveLength(allChunks - keptChunks);
      expect(chunkIds.every((id) => /^gateway-trace-chunk:[0-9a-f]{64}$/.test(id))).toBe(true);
      expect(await count(fixture, "client_gateway_trace_chunks")).toBe(keptChunks);
      expect(await fixture.rows("select trace_id from client_gateway_trace_chunk_uses where trace_id = 'trace-gone'")).toEqual([]);
      const again = await retention.sweepUnreferencedObjects({ limit: 1_000 });
      expect(again.deleted.filter((id) => id.startsWith("gateway-trace-chunk:"))).toEqual([]);
    } finally {
      await retention.close();
    }
    const read = await fixture.store.readEventRange("trace-kept", 1, 9);
    expect(read.map((event) => JSON.stringify(event))).toEqual(kept.map((event) => JSON.stringify(event)));
  });

  it("frees no more chunks in one sweep than its limit", async () => {
    fixture = await SqliteTraceFixture.create();
    await recordTexts(fixture.store, "trace-gone", [records(6_000, "limited")]);
    const held = await count(fixture, "client_gateway_trace_chunks");
    await fixture.sql("delete from client_gateway_trace_events where trace_id = 'trace-gone'");
    const retention = await AutomationStudioProjectRetentionStore.open({ pool: fixture.databasePool, projectId: SqliteTraceFixture.projectId });
    try {
      const first = await retention.sweepUnreferencedObjects({ limit: 3 });
      expect(first.deleted.filter((id) => id.startsWith("gateway-trace-chunk:"))).toHaveLength(3);
      expect(await count(fixture, "client_gateway_trace_chunks")).toBe(held - 3);
      await retention.sweepUnreferencedObjects({ limit: 1_000 });
      expect(await count(fixture, "client_gateway_trace_chunks")).toBe(0);
    } finally {
      await retention.close();
    }
  });

  it("removes a deleted project's traces, chunk uses, chunks and content objects, and leaves other projects whole", async () => {
    const key = protection();
    fixture = await SqliteTraceFixture.create({ protection: key });
    await recordTexts(fixture.store, "trace-doomed", [records(6_000, "doomed"), '{"n":2}']);
    await fixture.store.writeArtifact("trace-doomed", "artifact-1", new Uint8Array(Buffer.from("artifact bytes")));
    expect(await count(fixture, "client_gateway_trace_chunks")).toBeGreaterThan(10);
    expect(await count(fixture, "objects")).toBe(1);
    const other = await AutomationStudioProjectGatewayTraceStore.open({ pool: fixture.databasePool, projectId: OTHER_PROJECT, protection: key });
    let otherWritten: ClientGatewayTraceEvent[];
    try {
      otherWritten = await recordTexts(other, "trace-other", [records(6_000, "doomed")]);
    } finally {
      await other.close();
    }

    await fixture.closeAll();
    await removeAutomationStudioProjectFiles({
      objectStore: undefined,
      pool: fixture.databasePool,
      projectId: SqliteTraceFixture.projectId,
      projectDirectory: fixture.projectDirectory
    });
    expect(await exists(path.join(fixture.projectDirectory, "project.sqlite"))).toBe(false);

    const fresh = await fixture.reopen({ protection: key });
    await expect(fresh.readEventRange("trace-doomed", 1, 9)).rejects.toThrow(/trace trace-doomed is not in this store/);
    expect(await fresh.listManifests({})).toEqual([]);
    expect(await count(fixture, "client_gateway_trace_events")).toBe(0);
    expect(await count(fixture, "client_gateway_trace_chunk_uses")).toBe(0);
    expect(await count(fixture, "client_gateway_trace_chunks")).toBe(0);
    expect(await count(fixture, "client_gateway_trace_artifacts")).toBe(0);
    expect(await count(fixture, "objects")).toBe(0);
    expect(await exists(path.join(fixture.projectDirectory, "objects"))).toBe(false);

    const otherAgain = await AutomationStudioProjectGatewayTraceStore.open({ pool: fixture.databasePool, projectId: OTHER_PROJECT, protection: key });
    try {
      const read = await otherAgain.readEventRange("trace-other", 1, 9);
      expect(read.map((event) => JSON.stringify(event))).toEqual(otherWritten.map((event) => JSON.stringify(event)));
    } finally {
      await otherAgain.close();
    }
  });
});
