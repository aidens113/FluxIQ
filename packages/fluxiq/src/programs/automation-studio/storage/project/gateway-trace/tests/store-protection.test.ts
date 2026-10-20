// @fluxiq-test-group real-sql
// Lane T P3-E: a gateway trace store opened with the project's content
// protection seals what it keeps of page content, as protected content-store
// objects are sealed. No event text or artifact byte reaches the database file
// or the object files as plaintext; reads give back exactly what was written;
// a sealed chunk read without the key, or with the wrong one, throws; chunks
// written unsealed before still read and are sealed when a protected store
// opens or reuses them.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStoreWriter } from "../../../../../../client-gateway/trace/index.ts";
import { newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID, AutomationStudioAesGcmProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../index.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

const SMALL_MARKER = "MARKER-small-event-7f3a91";
const LARGE_MARKER = "MARKER-large-event-c02e44";
const ARTIFACT_MARKER = "MARKER-artifact-bytes-5bd210";

let fixture: SqliteTraceFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function protection(keyByte: number, keyId = "key.1"): AutomationStudioAesGcmProjectContentProtection {
  return new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId, key: Buffer.alloc(32, keyByte) }));
}

/** Serialized records with the large marker in the middle; about `count` * 60 bytes. */
function records(count: number, salt: string): string {
  const items: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = index === Math.floor(count / 2) ? LARGE_MARKER : `Item ${salt}-${index}`;
    items.push(`{"id":"e${index}","label":"${label}","stock":${index % 89}}`);
  }
  return `{"type":"client.state_update","entries":[${items.join(",")}]}`;
}

function artifactBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(`${ARTIFACT_MARKER}:${"x".repeat(2_000)}`, "utf8"));
}

/** Records the texts into one trace through a writer that keeps a copy of exactly what reached the store. */
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

/** The small event, the large event (with emoji cut across chunk boundaries) and an artifact, in one trace. */
async function writeTrace(store: AutomationStudioProjectGatewayTraceStore, traceId: string): Promise<ClientGatewayTraceEvent[]> {
  const written = await recordTexts(store, traceId, [
    `{"small":"${SMALL_MARKER}","absent_vs_null":null,"n":1.0}`,
    `${records(4_000, traceId)}${"😀".repeat(3_000)}`
  ]);
  await store.writeArtifact(traceId, "artifact-1", artifactBytes());
  return written;
}

/** Every file under the project directory: the database, its WAL if one is left, the content object files. */
async function projectFiles(directory: string): Promise<Array<{ name: string; bytes: Buffer }>> {
  const files: Array<{ name: string; bytes: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await projectFiles(name)));
    if (entry.isFile()) files.push({ name, bytes: await readFile(name) });
  }
  return files;
}

function filesHolding(files: ReadonlyArray<{ name: string; bytes: Buffer }>, marker: string): string[] {
  return files.filter((file) => file.bytes.includes(Buffer.from(marker, "utf8"))).map((file) => path.basename(file.name));
}

/** A chunk row's bytes as stored and, when they inflate, inflated: where a marker would show if the row were not sealed. */
function chunkTexts(row: { stored: Buffer }): Buffer[] {
  try {
    return [row.stored, inflateRawSync(row.stored)];
  } catch {
    return [row.stored];
  }
}

type ChunkRow = { digest: Buffer; encoding: string; stored: Buffer; encryption: string | null };

async function chunkRows(current: SqliteTraceFixture): Promise<ChunkRow[]> {
  return current.rows<ChunkRow>("select digest, encoding, stored, encryption from client_gateway_trace_chunks order by digest");
}

async function unsealedCount(current: SqliteTraceFixture): Promise<number> {
  const [row] = await current.rows<{ count: number }>("select count(*) as count from client_gateway_trace_chunks where encryption is null");
  return row?.count ?? -1;
}

describe("gateway trace chunks under the project's content protection", () => {
  it("keeps no event text or artifact byte as plaintext on disk, and reads back exactly what was written", async () => {
    const key = protection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    const written = await writeTrace(fixture.store, "trace-sealed");
    await fixture.closeAll();
    const files = await projectFiles(fixture.projectDirectory);
    expect(files.some((file) => file.name.endsWith("project.sqlite"))).toBe(true);
    expect(filesHolding(files, SMALL_MARKER)).toEqual([]);
    expect(filesHolding(files, LARGE_MARKER)).toEqual([]);
    expect(filesHolding(files, ARTIFACT_MARKER)).toEqual([]);

    const store = await fixture.reopen({ protection: key });
    const layout = await fixture.rows<{ inline: number }>("select event_json is not null as inline from client_gateway_trace_events where trace_id = 'trace-sealed'");
    expect(layout.map((row) => row.inline)).toEqual([0, 0]);
    const rows = await chunkRows(fixture);
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.encryption).not.toBeNull();
      expect(JSON.parse(row.encryption ?? "{}")).toMatchObject({ version: 1, providerId: AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID, keyId: "key.1" });
      for (const text of chunkTexts(row)) {
        expect(text.includes(Buffer.from(SMALL_MARKER))).toBe(false);
        expect(text.includes(Buffer.from(LARGE_MARKER))).toBe(false);
      }
    }
    const read = await store.readEventRange("trace-sealed", 1, 99);
    expect(read.map((event) => JSON.stringify(event))).toEqual(written.map((event) => JSON.stringify(event)));
    expect(Buffer.from((await store.readArtifact("trace-sealed", "artifact-1")) ?? new Uint8Array())).toEqual(Buffer.from(artifactBytes()));
    const measure = await store.measureTrace("trace-sealed");
    expect({ events: measure.events, inline: measure.inlineEvents, chunked: measure.chunkedEvents, artifacts: measure.artifacts }).toEqual({ events: 2, inline: 0, chunked: 2, artifacts: 1 });
    expect(measure.chunks).toBe(rows.length);
    expect(await store.measureTraceChunks(["trace-sealed"])).toEqual({ traces: 1, chunks: rows.length, storedChunkBytes: measure.storedChunkBytes });
  });

  it("would show every marker without a protection, so the scan above can see plaintext", async () => {
    fixture = await SqliteTraceFixture.create();
    await writeTrace(fixture.store, "trace-plain");
    const rows = await chunkRows(fixture);
    expect(rows.every((row) => row.encryption === null)).toBe(true);
    expect(rows.some((row) => chunkTexts(row).some((text) => text.includes(Buffer.from(LARGE_MARKER))))).toBe(true);
    await fixture.closeAll();
    const files = await projectFiles(fixture.projectDirectory);
    const holding = filesHolding(files, SMALL_MARKER);
    expect(holding.length).toBeGreaterThan(0);
    expect(holding.every((name) => name.startsWith("project.sqlite"))).toBe(true);
    expect(filesHolding(files, ARTIFACT_MARKER)).toHaveLength(1);
  });

  it("refuses to read sealed chunks and artifacts without the key, with the wrong key, or after the key is retired", async () => {
    fixture = await SqliteTraceFixture.create({ protection: protection(7) });
    await writeTrace(fixture.store, "trace-locked");

    const bare = await fixture.reopen();
    await expect(bare.readEventRange("trace-locked", 1, 99)).rejects.toThrow(/is protected and cannot be opened without the project's content protection/);
    await expect(bare.readArtifact("trace-locked", "artifact-1")).rejects.toThrow(/cannot be opened without its protection provider/);

    const wrong = await fixture.reopen({ protection: protection(8) });
    await expect(wrong.readEventRange("trace-locked", 1, 1)).rejects.toThrow(/could not be opened: Protected project content authentication failed/);
    await expect(wrong.readArtifact("trace-locked", "artifact-1")).rejects.toThrow(/authentication failed/);

    const retired = await fixture.reopen({ protection: new AutomationStudioAesGcmProjectContentProtection(() => undefined) });
    await expect(retired.readEventRange("trace-locked", 2, 2)).rejects.toThrow(/could not be opened: Protected project content key is unavailable/);

    const rotated = await fixture.reopen({ protection: protection(7, "key.2") });
    await expect(rotated.readEventRange("trace-locked", 1, 1)).rejects.toThrow(/key is unavailable/);
  });

  it("reads chunks written unsealed, marked as such, and seals them when a protected store opens", async () => {
    fixture = await SqliteTraceFixture.create();
    const written = await recordTexts(fixture.store, "trace-legacy", [records(5_000, "legacy")]);
    const before = await chunkRows(fixture);
    expect(before.length).toBeGreaterThan(10);
    expect(await unsealedCount(fixture)).toBe(before.length);
    const plainRead = await (await fixture.reopen()).readEventRange("trace-legacy", 1, 9);
    expect(plainRead.map((event) => JSON.stringify(event))).toEqual(written.map((event) => JSON.stringify(event)));

    const key = protection(9);
    const sealed = await fixture.reopen({ protection: key });
    expect(await unsealedCount(fixture)).toBe(0);
    const after = await chunkRows(fixture);
    expect(after.map((row) => row.digest.toString("hex"))).toEqual(before.map((row) => row.digest.toString("hex")));
    expect(after.map((row) => row.encoding)).toEqual(before.map((row) => row.encoding));
    for (const [index, row] of after.entries()) expect(row.stored.equals(before[index]!.stored)).toBe(false);
    const sealedRead = await sealed.readEventRange("trace-legacy", 1, 9);
    expect(sealedRead.map((event) => JSON.stringify(event))).toEqual(written.map((event) => JSON.stringify(event)));
    await expect((await fixture.reopen()).readEventRange("trace-legacy", 1, 9)).rejects.toThrow(/is protected/);
  });

  it("seals an unsealed chunk a protected write reuses", async () => {
    fixture = await SqliteTraceFixture.create({ protection: protection(5) });
    const plain = await AutomationStudioProjectGatewayTraceStore.open({ pool: fixture.databasePool, projectId: SqliteTraceFixture.projectId });
    try {
      const text = records(5_000, "shared");
      await recordTexts(plain, "trace-plain", [text]);
      expect(await unsealedCount(fixture)).toBeGreaterThan(10);
      const written = await recordTexts(fixture.store, "trace-protected", [text]);
      const [shared] = await fixture.rows<{ count: number }>(
        `select count(*) as count from client_gateway_trace_chunk_uses a
         join client_gateway_trace_chunk_uses b on a.digest = b.digest
         where a.trace_id = 'trace-plain' and b.trace_id = 'trace-protected'`
      );
      expect(shared?.count).toBeGreaterThan(10);
      const [open] = await fixture.rows<{ count: number }>(
        `select count(*) as count from client_gateway_trace_chunk_uses u
         join client_gateway_trace_chunks c on c.digest = u.digest
         where u.trace_id = 'trace-protected' and c.encryption is null`
      );
      expect(open?.count).toBe(0);
      const read = await fixture.store.readEventRange("trace-protected", 1, 9);
      expect(read.map((event) => JSON.stringify(event))).toEqual(written.map((event) => JSON.stringify(event)));
      expect((await fixture.store.readEventRange("trace-plain", 1, 1)).map((event) => event.sequence)).toEqual([1]);
    } finally {
      await plain.close();
    }
  });
});
