import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StateSnapshot } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("stores project state image assets as digest-addressed object references", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "State assets" });
    const content = Buffer.from("png-bytes");
    const sha256 = createHash("sha256").update(content).digest("hex");

    const asset = await service.writeProjectObjectAsset({
      projectId: project.id,
      recordingId: "recording.capture",
      content,
      mediaType: "image/png",
      expectedSha256: sha256
    });

    expect(asset).toEqual({
      sha256,
      size: content.byteLength,
      mediaType: "image/png",
      contentRef: `automation-object://project/${encodeURIComponent(project.id)}/${sha256}`,
      apiPath: `/api/programs/automation-studio/state-assets/${encodeURIComponent(project.id)}/${sha256}`
    });
    await expect(service.readProjectObjectAsset(project.id, sha256)).resolves.toMatchObject({
      sha256,
      size: content.byteLength,
      mediaType: "image/png",
      content
    });
    await expect(readFile(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", "recording.capture", "objects", `${sha256}.png`))).resolves.toEqual(content);
  });

  it("rejects state image assets whose bytes do not match the requested digest", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "State asset mismatch" });

    await expect(service.writeProjectObjectAsset({
      projectId: project.id,
      content: Buffer.from("different-bytes"),
      mediaType: "image/png",
      expectedSha256: "0".repeat(64)
    })).rejects.toThrow("digest does not match");
  });

  it("deletes recording-owned state image assets when no remaining recording references them", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Recording asset cleanup" });
    const content = Buffer.from("recording-screenshot");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.with-screenshot", content, mediaType: "image/png", expectedSha256: sha256 });
    const orphanContent = Buffer.from("old-orphan-screenshot");
    const orphanSha256 = createHash("sha256").update(orphanContent).digest("hex");
    await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.with-screenshot", content: orphanContent, mediaType: "image/png", expectedSha256: orphanSha256 });
    const state = {
      timestamp: 1,
      namespaces: {},
      presentation: {
        defaultFrameId: "screen",
        visualFrames: [{
          id: "screen",
          coordinateSpace: { width: 100, height: 100, unit: "px" },
          layers: [{ id: "image", kind: "image", contentRef: asset.contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
        }]
      }
    } satisfies StateSnapshot;
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.with-screenshot", initialState: { timestamp: 0, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "client.state_snapshot", payload: { state } }
    });

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(service.readProjectObjectAsset(project.id, sha256)).rejects.toThrow("not found");
    await expect(service.readProjectObjectAsset(project.id, orphanSha256)).rejects.toThrow("not found");
    await expect(readFile(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "objects", `${sha256}.png`))).rejects.toThrow();
  });

  it("deletes unindexed files left under the recording session directory", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Recording directory cleanup" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.with-leftovers", initialState: { timestamp: 0, namespaces: {} } });
    const sessionDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId);
    await mkdir(path.join(sessionDir, "objects"), { recursive: true });
    await mkdir(path.join(sessionDir, "derived", "custom"), { recursive: true });
    await writeFile(path.join(sessionDir, "objects", "unindexed.png"), "stale image", "utf8");
    await writeFile(path.join(sessionDir, "derived", "custom", "leftover.json"), JSON.stringify({ recordingId: recording.recordingId }), "utf8");
    const oldDeletedSessionDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", "recording.old-deleted");
    await mkdir(path.join(oldDeletedSessionDir, "objects"), { recursive: true });
    await writeFile(path.join(oldDeletedSessionDir, "objects", "leftover.png"), "old stale image", "utf8");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(readdir(sessionDir)).rejects.toThrow();
    await expect(readdir(oldDeletedSessionDir)).rejects.toThrow();
  });

  it("deletes stale shared pipeline artifacts owned by the deleted recording", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Shared pipeline cleanup" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.shared-artifacts", initialState: { timestamp: 0, namespaces: {} } });
    const projectDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id);
    const sharedFact = path.join(projectDir, "pipeline", "shared", "evidence", "facts", "fact.stale.json");
    const pipelineIndex = path.join(projectDir, "indexes", "pipeline.json");
    await mkdir(path.dirname(sharedFact), { recursive: true });
    await mkdir(path.dirname(pipelineIndex), { recursive: true });
    await writeFile(sharedFact, JSON.stringify({ factId: "fact.stale", recordingId: recording.recordingId, value: true }), "utf8");
    await writeFile(pipelineIndex, JSON.stringify({
      pipelines: [],
      normalizationReviews: [],
      miningRuns: [],
      evidenceFacts: [{ factId: "fact.stale", generatedAt: 1, recordingId: recording.recordingId }],
      evidenceObservations: [],
      stateActionCorrelations: [],
      evidenceClaims: [],
      learnedTaskModels: [],
      policyProposals: [],
      recordingFlowProposals: [],
      replayResults: []
    }, null, 2), "utf8");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(readFile(sharedFact, "utf8")).rejects.toThrow();
    const index = JSON.parse(await readFile(pipelineIndex, "utf8")) as { evidenceFacts: unknown[] };
    expect(index.evidenceFacts).toEqual([]);
  });

  it("deletes recording batches with one index and pipeline cleanup pass", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Batch cleanup" });
    const first = await service.createRecording({ projectId: project.id, recordingId: "recording.batch-a", initialState: { timestamp: 0, namespaces: {} } });
    const second = await service.createRecording({ projectId: project.id, recordingId: "recording.batch-b", initialState: { timestamp: 0, namespaces: {} } });
    const kept = await service.createRecording({ projectId: project.id, recordingId: "recording.batch-kept", initialState: { timestamp: 0, namespaces: {} } });
    const projectDir = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    const sharedFactsDir = path.join(projectDir, "pipeline", "shared", "evidence", "facts");
    await mkdir(sharedFactsDir, { recursive: true });
    await writeFile(path.join(sharedFactsDir, "fact.batch-a.json"), JSON.stringify({ factId: "fact.batch-a", recordingId: first.recordingId }), "utf8");
    await writeFile(path.join(sharedFactsDir, "fact.batch-b.json"), JSON.stringify({ factId: "fact.batch-b", recordingId: second.recordingId }), "utf8");
    await writeFile(path.join(sharedFactsDir, "fact.batch-kept.json"), JSON.stringify({ factId: "fact.batch-kept", recordingId: kept.recordingId }), "utf8");

    const deleted = await service.deleteRecordings({ projectId: project.id, recordingIds: [first.recordingId, second.recordingId] });
    expect(deleted).toEqual({
      deletedRecordingIds: [first.recordingId, second.recordingId],
      deletedProposalIds: []
    });

    await expect(readdir(path.join(projectDir, "recordings", first.recordingId))).rejects.toThrow();
    await expect(readdir(path.join(projectDir, "recordings", second.recordingId))).rejects.toThrow();
    await expect(readdir(path.join(projectDir, "recordings", kept.recordingId))).resolves.toBeTruthy();
    await expect(readFile(path.join(sharedFactsDir, "fact.batch-a.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(sharedFactsDir, "fact.batch-b.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(sharedFactsDir, "fact.batch-kept.json"), "utf8")).resolves.toContain("fact.batch-kept");
  });

  it("keeps deleted recording assets that are still referenced by another recording", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Shared asset cleanup" });
    const content = Buffer.from("shared-screenshot");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await service.writeProjectObjectAsset({ projectId: project.id, content, mediaType: "image/png", expectedSha256: sha256 });
    const state = {
      timestamp: 1,
      namespaces: {},
      presentation: {
        visualFrames: [{
          id: "screen",
          coordinateSpace: { width: 100, height: 100, unit: "px" },
          layers: [{ id: "image", kind: "image", contentRef: asset.contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
        }]
      }
    } satisfies StateSnapshot;
    const deleted = await service.createRecording({ projectId: project.id, recordingId: "recording.deleted", initialState: state });
    await service.createRecording({ projectId: project.id, recordingId: "recording.kept", initialState: state });

    await service.deleteRecording({ projectId: project.id, recordingId: deleted.recordingId });

    await expect(service.readProjectObjectAsset(project.id, sha256)).resolves.toMatchObject({ sha256, content });
  });
});
