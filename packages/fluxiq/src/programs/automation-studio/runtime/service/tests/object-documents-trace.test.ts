// @fluxiq-test-group real-sql
// A state-asset upload and traces (traces and offline trials, P2; D13): the
// expected digest is checked before anything is written, and a stored
// screenshot is handed to the client gateway's trace intake for the uploading
// session, so every open trace claiming that session takes it as an artifact.
// T11 end to end: the screenshot stays readable from the trace after the
// legacy object store prunes it, and once the trace's own content object is
// removed the completeness evaluator reports it missing.

import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClientGatewayService,
  evaluateClientGatewayTraceCompleteness,
  type ClientGatewayTraceStore
} from "../../../../../client-gateway/index.ts";
import { CLIENT_GATEWAY_TRACE_TAP_STREAMS } from "../../../../../client-gateway/service/index.ts";
import { pairClient } from "../../../../../client-gateway/tests/trace-tap-support.ts";
import { AutomationStudioObjectStore } from "../../../storage/index.ts";
import { SqliteTraceFixture } from "../../../storage/project/gateway-trace/tests/sqlite-trace-fixture.ts";
import { episode, newEpisodes } from "../../gateway-trace/tests/episode-builders.ts";
import { AutomationStudioObjectDocuments } from "../object-documents.ts";
import type { AutomationStudioProjectPaths, AutomationStudioRecordingPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";

const PROJECT_ID = SqliteTraceFixture.projectId;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

let objectRoot: string;
let objectStore: AutomationStudioObjectStore;
let documents: AutomationStudioObjectDocuments;

beforeEach(async () => {
  objectRoot = await mkdtemp(path.join(os.tmpdir(), "automation-studio-object-documents-trace-"));
  objectStore = new AutomationStudioObjectStore(objectRoot);
  const projects = { requireProject: async () => undefined } as unknown as AutomationStudioProjectStore;
  documents = new AutomationStudioObjectDocuments({} as AutomationStudioProjectPaths, {} as AutomationStudioRecordingPaths, projects, objectStore);
});

afterEach(async () => {
  await rm(objectRoot, { recursive: true, force: true });
});

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

describe("a state-asset upload", () => {
  it("is refused on a mismatched digest before anything is written, and nothing reaches a trace", async () => {
    const receiveTraceArtifact = vi.fn();

    await expect(documents.writeProjectObjectAsset({
      projectId: PROJECT_ID,
      content: PNG,
      mediaType: "image/png",
      expectedSha256: "b".repeat(64),
      traceIntake: { sessionId: "session-1", gateway: { receiveTraceArtifact } }
    })).rejects.toThrow(/digest does not match/);

    expect(await filesUnder(objectRoot)).toEqual([]);
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("hands the stored bytes to the trace intake for the uploading session", async () => {
    const receiveTraceArtifact = vi.fn(() => ({ status: "accepted" as const, traces: 1 }));

    const stored = await documents.writeProjectObjectAsset({
      projectId: PROJECT_ID,
      content: PNG,
      mediaType: "image/png",
      expectedSha256: digest(PNG).toUpperCase(),
      traceIntake: { sessionId: "session-1", gateway: { receiveTraceArtifact } }
    });

    expect(stored.sha256).toBe(digest(PNG));
    expect(receiveTraceArtifact).toHaveBeenCalledWith("session-1", { sha256: digest(PNG), mediaType: "image/png", bytes: new Uint8Array(PNG) });
  });

  it("without a trace intake stores the asset as before", async () => {
    const stored = await documents.writeProjectObjectAsset({ projectId: PROJECT_ID, content: PNG, mediaType: "image/png", expectedSha256: digest(PNG) });
    expect((await objectStore.readProjectObject(PROJECT_ID, stored.sha256)).content).toEqual(PNG);
  });
});

describe("T11: a captured screenshot outlives the legacy object store", () => {
  let fixture: SqliteTraceFixture;

  beforeEach(async () => {
    fixture = await SqliteTraceFixture.create();
  });

  afterEach(async () => {
    await fixture.dispose();
  });

  async function evaluate(store: ClientGatewayTraceStore, traceId: string) {
    const manifest = await store.readManifest(traceId);
    if (manifest === undefined) throw new Error("the trace has no manifest");
    const events = await store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
    return evaluateClientGatewayTraceCompleteness({ manifest, events, availableArtifacts: await store.listArtifacts(traceId), compatibility: { status: "compatible" }, recorderActive: false });
  }

  it("stays readable from the trace after the recording prune, and reads as missing once its content object is gone", async () => {
    const { episodes } = newEpisodes({
      storeFor: () => fixture.store,
      gatewayStreams: [CLIENT_GATEWAY_TRACE_TAP_STREAMS.gateway, CLIENT_GATEWAY_TRACE_TAP_STREAMS.artifact]
    });
    const source = episodes.gatewaySource;
    if (source === undefined) throw new Error("tracing is on, so the episodes hand the gateway a source");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: source });
    try {
      const client = await pairClient(gateway, "client.screenshot");
      const traceId = "trace-1";
      await episodes.run(episode({ projectId: PROJECT_ID, episodeId: "run-1" }), async () => {
        // The episode claims the client's session by sending it a command, as a traced run does.
        await gateway.captureSnapshot(client.sessionId, {});
        await documents.writeProjectObjectAsset({
          projectId: PROJECT_ID,
          recordingId: "recording-1",
          content: PNG,
          mediaType: "image/png",
          expectedSha256: digest(PNG),
          traceIntake: { sessionId: client.sessionId, gateway }
        });
      });

      const manifest = await fixture.store.readManifest(traceId);
      const artifact = manifest?.artifacts.find((entry) => entry.sha256 === digest(PNG));
      if (artifact === undefined) throw new Error("the trace took no screenshot");

      // The legacy store's recording prune deletes the screenshot's only other copy.
      expect((await objectStore.deleteRecordingObjects(PROJECT_ID, "recording-1")).deleted).toEqual([digest(PNG)]);
      await expect(objectStore.readProjectObject(PROJECT_ID, digest(PNG))).rejects.toThrow();
      const reopened = await fixture.reopen();
      expect(Buffer.from((await reopened.readArtifact(traceId, artifact.id))!)).toEqual(PNG);
      expect((await evaluate(reopened, traceId)).status).toBe("complete");

      const [row] = await fixture.rows<{ relative_path: string }>(
        "select objects.relative_path from client_gateway_trace_artifacts join objects on objects.object_id = client_gateway_trace_artifacts.object_id where trace_id = ? and artifact_id = ?",
        [traceId, artifact.id]
      );
      if (row === undefined) throw new Error("the screenshot has no content object");
      await rm(path.join(fixture.rootDir, row.relative_path));
      const completeness = await evaluate(reopened, traceId);
      expect(completeness.status).not.toBe("complete");
      expect(completeness.issues.map((issue) => issue.code)).toContain("missing_artifact");
    } finally {
      await gateway.close();
    }
  });
});
