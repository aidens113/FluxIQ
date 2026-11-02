import { expect, it, vi } from "vitest";
import { createCanonicalAutomationStudioMemoryRepositories } from "../../../../storage/index.ts";
import { createRecordingSession } from "../../../../model/index.ts";
import { RecordingProjectMirror } from "../mirror.ts";

const recording = (projectId?: string) => createRecordingSession({ recordingId: "recording.shared", initialState: { timestamp: 1, namespaces: {} }, ...(projectId ? { metadata: { projectId } } : {}) });

it("serializes compare/delete with all puts through the same original repository and ID", async () => {
  const repository = createCanonicalAutomationStudioMemoryRepositories().recordingSessions;
  const one = new RecordingProjectMirror(repository, value => value.recordingId);
  const two = new RecordingProjectMirror(repository, value => value.recordingId);
  await one.put(recording("project.first"), { projectId: "project.first" });
  let entered: () => void = () => undefined;
  let release: () => void = () => undefined;
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const get = repository.get.bind(repository);
  vi.spyOn(repository, "get").mockImplementationOnce(async id => {
    const value = await get(id);
    entered();
    await held;
    return value;
  });
  const removed = one.delete("recording.shared", "project.first");
  await reading;
  let published = false;
  const replacement = two.put(recording("project.second"), { projectId: "project.second" }).then(value => {
    published = true;
    return value;
  });
  await Promise.resolve();
  expect(published).toBe(false);
  release();
  expect(await removed).toBe(true);
  await replacement;
  expect((await repository.get("recording.shared"))?.metadata.projectId).toBe("project.second");
});

it("never replaces or deletes a foreign or ownerless mirror from a scoped load/delete", async () => {
  const repository = createCanonicalAutomationStudioMemoryRepositories().recordingSessions;
  const mirror = new RecordingProjectMirror(repository, value => value.recordingId);
  for (const existing of [recording("project.second"), recording()]) {
    await repository.put(existing);
    const local = await mirror.put(recording(), { projectId: "project.first", loaded: true });
    expect(local.metadata.projectId).toBe("project.first");
    expect(await repository.get("recording.shared")).toEqual(existing);
    expect(await mirror.delete("recording.shared", "project.first")).toBe(false);
    expect(await repository.get("recording.shared")).toEqual(existing);
  }
});

it("keeps exclusive memory creation atomic across separate owners of the same repository", async () => {
  const repository = createCanonicalAutomationStudioMemoryRepositories().recordingSessions;
  const one = new RecordingProjectMirror(repository, value => value.recordingId);
  const two = new RecordingProjectMirror(repository, value => value.recordingId);
  const outcomes = await Promise.allSettled([one.put(recording("project.first"), { projectId: "project.first", createExclusive: true }), two.put(recording("project.second"), { projectId: "project.second", createExclusive: true })]);
  expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "rejected"]);
  expect((await repository.get("recording.shared"))?.metadata.projectId).toBe("project.first");
});

it("keeps repository receiver/error identity and releases a failed writer for the next operation", async () => {
  const repository = createCanonicalAutomationStudioMemoryRepositories().recordingSessions;
  const mirror = new RecordingProjectMirror(repository, value => value.recordingId);
  const original = repository.put;
  const failure = new Error("Fixture mirror write failed");
  vi.spyOn(repository, "put").mockImplementationOnce(function (this: typeof repository) {
    expect(this).toBe(repository);
    return Promise.reject(failure);
  }).mockImplementation(function (this: typeof repository, value) {
    expect(this).toBe(repository);
    return original.call(this, value);
  });
  await expect(mirror.put(recording("project.first"))).rejects.toBe(failure);
  await mirror.put(recording("project.second"));
  expect((await repository.get("recording.shared"))?.metadata.projectId).toBe("project.second");
});

it("does not relabel an existing memory owner from a new publication's project metadata", async () => {
  const repository = createCanonicalAutomationStudioMemoryRepositories().recordingSessions;
  const mirror = new RecordingProjectMirror(repository, value => value.recordingId);
  await mirror.put(recording("project.first"), { projectId: "project.first", createExclusive: true });
  await expect(mirror.put(recording("project.first"), { createExclusive: true })).rejects.toThrow("Recording ID is already owned by another project");
  expect((await mirror.readOwned("recording.shared", "project.first"))?.metadata.projectId).toBe("project.first");
});

it("reads cache ownership only after the queued publication and its origin have both settled", async () => {
  const repository = createCanonicalAutomationStudioMemoryRepositories().recordingSessions;
  const mirror = new RecordingProjectMirror(repository, value => value.recordingId);
  await mirror.put(recording("project.first"), { projectId: "project.first" });
  let entered: () => void = () => undefined;
  let release: () => void = () => undefined;
  const writing = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const put = repository.put.bind(repository);
  vi.spyOn(repository, "put").mockImplementationOnce(async value => {
    const stored = await put(value);
    entered();
    await held;
    return stored;
  });
  const publishing = mirror.put(recording("project.first"));
  await writing;
  let readSettled = false;
  const reading = mirror.readOwned("recording.shared", "project.first").then(value => {
    readSettled = true;
    return value;
  });
  await Promise.resolve();
  expect(readSettled).toBe(false);
  release();
  await publishing;
  expect(await reading).toBeNull();
});
