// @fluxiq-test-group real-sql
// Deleting a project in the object-store layout (`storageRootDir`) removes its
// project directory, as the folder layout always did: `project.sqlite` with
// every trace, chunk and event, and the content objects beside it. Removing
// only the project's documents from program state once left all of that on
// disk after the project was gone (lane T P3-E2). Another project's traces
// and objects stay, and read back exactly.
import { createHash } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStoreWriter } from "../../../../../../client-gateway/trace/index.ts";
import { newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../../../../storage/index.ts";
import { AutomationStudioGatewayTraceServicePools } from "../../../gateway-trace/wiring/index.ts";
import { AutomationStudioService } from "../../../service.ts";

let tempRoot = "";
let service: AutomationStudioService | undefined;

/** A trace with a small event, one large enough to be cut into chunks, and an artifact, written through the project's store over the service's pool. */
async function writeTrace(current: AutomationStudioService, projectId: string, traceId: string): Promise<ClientGatewayTraceEvent[]> {
  const pool = AutomationStudioGatewayTraceServicePools.of(current);
  if (pool === undefined) throw new Error("the service adopted no pool");
  const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId });
  try {
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
    recorder.record(textEvent(`{"small":"${traceId}"}`));
    const items = Array.from({ length: 2_000 }, (_, index) => `{"id":"${traceId}-${index}","stock":${index % 89}}`);
    recorder.record(textEvent(`{"entries":[${items.join(",")}]}`));
    await recorder.close({ terminationReason: "completed", terminationDetail: null });
    await store.writeArtifact(traceId, "artifact-1", new Uint8Array(Buffer.from(`artifact of ${traceId}`, "utf8")));
    return written;
  } finally {
    await store.close();
  }
}

/** What the project's database holds of traces: rows per table. */
async function traceRowCounts(current: AutomationStudioService, projectId: string): Promise<Record<string, number>> {
  const pool = AutomationStudioGatewayTraceServicePools.of(current);
  if (pool === undefined) throw new Error("the service adopted no pool");
  const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId });
  await store.close();
  const lease = await pool.acquire(projectId);
  try {
    const counts: Record<string, number> = {};
    for (const table of ["client_gateway_traces", "client_gateway_trace_events", "client_gateway_trace_chunks", "client_gateway_trace_chunk_uses", "client_gateway_trace_artifacts", "objects"]) {
      const row = await lease.database.get<{ count: number }>(`select count(*) as count from ${table}`);
      if (row === undefined) throw new Error(`no count for ${table}`);
      counts[table] = row.count;
    }
    return counts;
  } finally {
    await lease.release();
  }
}

describe("deleting a project in the object-store layout", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-delete-project-object-store-"));
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
  });

  afterEach(async () => {
    await service?.close();
    service = undefined;
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("removes its directory, database with traces and chunks and content objects included, and keeps another project's", async () => {
    const storageRootDir = path.join(tempRoot, "artifacts", "automation-studio");
    service = new AutomationStudioService({ dataDir: tempRoot, storageRootDir, seedFixture: false });
    const deleted = await service.createProject({ name: "Deleted" });
    const kept = await service.createProject({ name: "Kept" });
    await writeTrace(service, deleted.id, "trace-deleted");
    const keptEvents = await writeTrace(service, kept.id, "trace-kept");
    const asset = Buffer.from("kept-asset-bytes");
    const assetSha256 = createHash("sha256").update(asset).digest("hex");
    for (const project of [deleted, kept]) await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.assets", content: asset, mediaType: "image/png", expectedSha256: assetSha256 });
    const deletedDirectory = path.join(storageRootDir, "projects", deleted.id);
    await access(path.join(deletedDirectory, "project.sqlite"));
    await access(path.join(deletedDirectory, "recordings", "recording.assets", "objects", `${assetSha256}.png`));
    const before = await traceRowCounts(service, deleted.id);
    expect(before.client_gateway_trace_chunks).toBeGreaterThan(0);
    expect(before.objects).toBeGreaterThan(0);

    await expect(service.deleteProject(deleted.id)).resolves.toEqual({ deletedProjectId: deleted.id });

    await expect(access(deletedDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await service.listProjects()).projects.map((project) => project.id)).toEqual([kept.id]);
    await expect(service.readProjectObjectAsset(deleted.id, assetSha256)).rejects.toThrow();

    const pool = AutomationStudioGatewayTraceServicePools.of(service);
    const keptStore = await AutomationStudioProjectGatewayTraceStore.open({ pool: pool!, projectId: kept.id });
    try {
      const read = await keptStore.readEventRange("trace-kept", 1, Number.MAX_SAFE_INTEGER);
      expect(read.map((event) => JSON.stringify(event))).toEqual(keptEvents.map((event) => JSON.stringify(event)));
      expect(Buffer.from((await keptStore.readArtifact("trace-kept", "artifact-1")) ?? new Uint8Array()).toString("utf8")).toBe("artifact of trace-kept");
    } finally {
      await keptStore.close();
    }
    await expect(service.readProjectObjectAsset(kept.id, assetSha256)).resolves.toMatchObject({ sha256: assetSha256 });

    // Opening the deleted project's database again finds a new, empty one: nothing of its traces, chunks or objects survived.
    expect(await traceRowCounts(service, deleted.id)).toEqual({
      client_gateway_traces: 0,
      client_gateway_trace_events: 0,
      client_gateway_trace_chunks: 0,
      client_gateway_trace_chunk_uses: 0,
      client_gateway_trace_artifacts: 0,
      objects: 0
    });
  });
});
