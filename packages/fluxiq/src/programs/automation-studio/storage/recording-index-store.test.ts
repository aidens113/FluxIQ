import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RecordingStateIndexStore } from "./recording-index-store.ts";
import { emptyRecordingIndex, type RecordingIndex } from "./state-index.ts";

const projectId = "project.one";
const recordingId = "recording.one";
const stateRef = `automation-object://project/${encodeURIComponent(projectId)}/${"a".repeat(64)}`;

describe("RecordingStateIndexStore", () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it("reads a missing index as an empty recording index", async () => {
    const store = await createStore();

    await expect(store.read(projectId, recordingId, { startedAt: 10, updatedAt: 20 })).resolves.toMatchObject({
      schemaVersion: "0.2",
      projectId,
      recordingId,
      summary: {
        eventCount: 0,
        actionCount: 0,
        stateSnapshotCount: 0
      }
    });
  });

  it("writes sorted indexes atomically", async () => {
    const store = await createStore();
    const index = validIndex();
    index.entries.z = { entryId: "z", type: "action" };
    index.entries.a = { entryId: "a", type: "observation" };

    await store.write(index);

    const saved = JSON.parse(await readFile(store.file(projectId, recordingId), "utf8")) as RecordingIndex;
    expect(Object.keys(saved.entries)).toEqual(["a", "entry.action", "entry.state", "z"]);
    await expect(store.read(projectId, recordingId)).resolves.toMatchObject({ recordingId });
  });

  it("updates and validates before writing", async () => {
    const store = await createStore();

    await store.update(projectId, recordingId, () => validIndex(), { startedAt: 10 });
    await expect(store.update(projectId, recordingId, (index) => ({
      ...index,
      entries: {
        ...index.entries,
        broken: { entryId: "broken", type: "action", stateSnapshotId: "missing" }
      }
    }))).rejects.toThrow("Recording state index is invalid");

    expect((await store.read(projectId, recordingId)).entries.broken).toBeUndefined();
  });

  it("deletes the index file", async () => {
    const store = await createStore();
    await store.write(validIndex());

    await expect(store.exists(projectId, recordingId)).resolves.toBe(true);
    await store.delete(projectId, recordingId);
    await expect(store.exists(projectId, recordingId)).resolves.toBe(false);
  });

  async function createStore(): Promise<RecordingStateIndexStore> {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-index-"));
    return new RecordingStateIndexStore(root);
  }
});

function validIndex(): RecordingIndex {
  const index = emptyRecordingIndex({ projectId, recordingId, startedAt: 10, updatedAt: 20 });
  index.summary.eventCount = 2;
  index.summary.actionCount = 1;
  index.summary.stateSnapshotCount = 1;
  index.entries["entry.state"] = { entryId: "entry.state", type: "observation", stateSnapshotId: "state.one" };
  index.entries["entry.action"] = { entryId: "entry.action", type: "action", actionId: "action.one", stateSnapshotId: "state.one" };
  index.actions["action.one"] = { actionId: "action.one", entryId: "entry.action", actionType: "click", stateAtActionId: "state.one" };
  index.states["state.one"] = {
    stateSnapshotId: "state.one",
    entryId: "entry.state",
    timestamp: 10,
    stateRef,
    objectRefs: [stateRef],
    linkedActionIds: ["action.one"]
  };
  return index;
}
