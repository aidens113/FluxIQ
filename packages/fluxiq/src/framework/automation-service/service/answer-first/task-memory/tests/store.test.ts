// @fluxiq-test-group real-sql
// What a task remembers: kept on disk and in memory, safe against an unreadable file and against
// two writes at once, capped, with its notes screened, and an index from attempt to task.
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { AutomationStudioAnswerFirstTaskMemoryStore, type AutomationStudioAnswerFirstAttemptProvenance, type AutomationStudioAnswerFirstTaskMemory, type AutomationStudioAnswerFirstTaskMemoryPorts, automationStudioAnswerFirstTaskMemoryOf } from "../index.ts";

const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstTaskMemoryStore>[1];
const cleanups: string[] = [];
afterEach(async () => { for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

async function onDisk() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-task-memory-"));
  cleanups.push(dir);
  const paths = new AutomationStudioProjectPaths(dir);
  const tasks = path.join(dir, "project.1", "task-memory");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(tasks, { recursive: true });
  return { dir, tasks, paths, store: new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS) };
}
const inMemory = () => new AutomationStudioAnswerFirstTaskMemoryStore(new AutomationStudioProjectPaths(undefined), PROJECTS);

const provenance = (attemptId: string, flowId = "flow.1"): AutomationStudioAnswerFirstAttemptProvenance => ({ attemptId, flowId, ordinal: 1, route: "build", steps: [{ position: 1, from: "worked_out" }] });
const withAttempt = (attemptId: string, flowId = "flow.1") => (memory: AutomationStudioAnswerFirstTaskMemory): AutomationStudioAnswerFirstTaskMemory => ({ ...memory, flowId, attempts: [...memory.attempts, provenance(attemptId, flowId)] });
const withNote = (words: { worked?: string; failed?: string; quirks?: string }, attemptId = "attempt.1") => (memory: AutomationStudioAnswerFirstTaskMemory): AutomationStudioAnswerFirstTaskMemory => ({ ...memory, notes: [...memory.notes, { attemptId, atMs: 1, from: "model", ...words }] });

describe("the task memory", () => {
  it("distinguishes missing scoped state from corrupt state without resetting it, while legacy reads retain recovery", async () => {
    const { store, tasks } = await onDisk();
    await expect(store.get("project.1", "missing", { scoped: true })).resolves.toBeUndefined();
    const file = path.join(tasks, "task.a.json");
    await writeFile(file, "{ malformed");
    const failure = await store.get("project.1", "task.a", { scoped: true }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).cause).toBeInstanceOf(Error);
    await expect(store.update("project.1", "task.a", withAttempt("new"), { scoped: true })).rejects.toThrow("stored execution state");
    expect(await readFile(file, "utf8")).toBe("{ malformed");
    await expect(store.get("project.1", "task.a")).resolves.toBeUndefined();
    await store.update("project.1", "task.a", withAttempt("legacy"));
    expect(await readdir(tasks)).toContain("task.a.json.unreadable");
  });

  it("never silently drops invalid scoped acts or source references during a strict read or replacement", async () => {
    const data = { kind: "attempt_act_record" as const, schemaVersion: 1 as const, acts: [], rows: [] };
    const store = inMemory();
    await store.update("project.1", "acts", (memory) => ({ ...memory, actsByScope: { key: { attemptId: "a", flowId: "f", data: { ...data, schemaVersion: 2 } as unknown as typeof data } } }));
    await expect(store.get("project.1", "acts", { scoped: true })).rejects.toThrow("stored execution state");
    await store.update("project.1", "source", (memory) => ({ ...memory, pipelineSourcesByScope: { key: { snapshotId: "old", count: -1 } } }));
    await expect(store.get("project.1", "source", { scoped: true })).rejects.toThrow("stored execution state");
    await expect(store.update("project.1", "new", (memory) => ({ ...memory, pipelineSourcesByScope: { key: { snapshotId: "old", count: -1 } } }), { scoped: true })).rejects.toThrow("replacement execution state");
    await expect(store.get("project.1", "new", { scoped: true })).resolves.toBeUndefined();
  });

  it("round-trips on disk, one file per task under the project, and reads back from a new store", async () => {
    const { store, paths, tasks } = await onDisk();
    await store.update("project.1", "task.a", withAttempt("attempt.1"));
    await store.update("project.1", "task.b", withAttempt("attempt.2"));
    expect((await readdir(tasks)).sort()).toEqual([".document-locks", "attempt-index.json", "task.a.json", "task.b.json"]);
    const again = new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS);
    await expect(again.get("project.1", "task.a")).resolves.toMatchObject({ taskId: "task.a", flowId: "flow.1", attempts: [{ attemptId: "attempt.1" }] });
    await expect(again.get("project.1", "task.none")).resolves.toBeUndefined();
  });

  it("round-trips in memory with no data root", async () => {
    const store = inMemory();
    await store.update("project.1", "task.a", withAttempt("attempt.1"));
    await expect(store.get("project.1", "task.a")).resolves.toMatchObject({ attempts: [{ attemptId: "attempt.1" }] });
    await expect(store.attemptLocation("project.1", "attempt.1")).resolves.toEqual({ taskId: "task.a", flowId: "flow.1" });
  });

  it("moves an unreadable file aside, reads it as nothing, and goes on", async () => {
    const { store, tasks } = await onDisk();
    await writeFile(path.join(tasks, "task.a.json"), "{ this is not json");
    await expect(store.get("project.1", "task.a")).resolves.toBeUndefined();
    await store.update("project.1", "task.a", withAttempt("attempt.1"));
    expect(await readdir(tasks)).toContain("task.a.json.unreadable");
    await expect(store.get("project.1", "task.a")).resolves.toMatchObject({ attempts: [{ attemptId: "attempt.1" }] });
  });

  it("moves a readable file of the wrong shape aside too, and an unreadable index", async () => {
    const { store, tasks } = await onDisk();
    await writeFile(path.join(tasks, "task.a.json"), JSON.stringify({ version: 1, data: { kind: "something_else" } }));
    await writeFile(path.join(tasks, "attempt-index.json"), "garbage");
    await store.update("project.1", "task.a", withAttempt("attempt.1"));
    expect((await readdir(tasks)).sort()).toEqual([".document-locks", "attempt-index.json", "attempt-index.json.unreadable", "task.a.json", "task.a.json.unreadable"]);
    await expect(store.attemptLocation("project.1", "attempt.1")).resolves.toEqual({ taskId: "task.a", flowId: "flow.1" });
  });

  it("loses nothing when updates run at once", async () => {
    for (const store of [(await onDisk()).store, inMemory()]) {
      await Promise.all(Array.from({ length: 12 }, (_, at) => store.update("project.1", "task.a", withAttempt(`attempt.${at}`))));
      const kept = await store.get("project.1", "task.a");
      expect(kept?.attempts.map((each) => each.attemptId).sort()).toEqual(Array.from({ length: 12 }, (_, at) => `attempt.${at}`).sort());
      for (let at = 0; at < 12; at += 1) await expect(store.attemptLocation("project.1", `attempt.${at}`)).resolves.toEqual({ taskId: "task.a", flowId: "flow.1" });
    }
  });

  it("retains both scope records when separate store instances update the same persisted task concurrently", async () => {
    const { store, paths } = await onDisk();
    const other = new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS);
    const data = { kind: "attempt_act_record" as const, schemaVersion: 1 as const, acts: [], rows: [] };
    await store.update("project.1", "task.a", withAttempt("initial"));
    await Promise.all([store, other].map((owner, at) => owner.update("project.1", "task.a", (memory) => ({
      ...memory, actsByScope: { ...memory.actsByScope, [`scope.${at}`]: { attemptId: `a.${at}`, flowId: "f", data } },
      pipelineSourcesByScope: { ...memory.pipelineSourcesByScope, [`scope.${at}`]: { snapshotId: `snapshot.${at}`, count: at + 1 } },
      attempts: [...memory.attempts, provenance(`a.${at}`, "f")]
    }), { scoped: true })));
    const kept = await new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS).get("project.1", "task.a", { scoped: true });
    expect(Object.keys(kept?.actsByScope ?? {}).sort()).toEqual(["scope.0", "scope.1"]);
    expect(Object.keys(kept?.pipelineSourcesByScope ?? {}).sort()).toEqual(["scope.0", "scope.1"]);
    expect(await store.attemptLocation("project.1", "a.0")).toEqual({ taskId: "task.a", flowId: "f" });
    expect(await store.attemptLocation("project.1", "a.1")).toEqual({ taskId: "task.a", flowId: "f" });
  });

  it("uses the existing layout-v2 owner transaction for concurrent acts and source references", async () => {
    const { dir } = await onDisk();
    await writeFile(path.join(dir, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    const paths = new AutomationStudioProjectPaths(path.join(dir, "artifacts", "automation-studio", "projects"));
    const stores = [new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS), new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS)];
    const data = { kind: "attempt_act_record" as const, schemaVersion: 1 as const, acts: [], rows: [] };
    await Promise.all(stores.map((store, at) => store.update("project.1", "task.a", (memory) => ({
      ...memory, actsByScope: { ...memory.actsByScope, [`scope.${at}`]: { attemptId: `a.${at}`, flowId: "f", data } },
      pipelineSourcesByScope: { ...memory.pipelineSourcesByScope, [`scope.${at}`]: { snapshotId: `snapshot.${at}`, count: at + 1 } },
      attempts: [...memory.attempts, provenance(`a.${at}`, "f")]
    }), { scoped: true })));
    const kept = await stores[0]!.get("project.1", "task.a", { scoped: true });
    expect(Object.keys(kept?.actsByScope ?? {}).sort()).toEqual(["scope.0", "scope.1"]);
    expect(Object.keys(kept?.pipelineSourcesByScope ?? {}).sort()).toEqual(["scope.0", "scope.1"]);
    expect(await stores[0]!.attemptLocation("project.1", "a.0")).toEqual({ taskId: "task.a", flowId: "f" });
    expect(await stores[0]!.attemptLocation("project.1", "a.1")).toEqual({ taskId: "task.a", flowId: "f" });
  });

  it("keeps the last 10 notes and the last 100 attempts", async () => {
    const store = inMemory();
    for (let at = 0; at < 12; at += 1) await store.update("project.1", "task.a", withNote({ worked: `note ${at}` }, `attempt.${at}`));
    await store.update("project.1", "task.a", (memory) => ({ ...memory, attempts: Array.from({ length: 105 }, (_, at) => provenance(`attempt.${at}`)) }));
    const kept = await store.get("project.1", "task.a");
    expect(kept?.notes.map((each) => each.worked)).toEqual(Array.from({ length: 10 }, (_, at) => `note ${at + 2}`));
    expect(kept?.attempts).toHaveLength(100);
    expect(kept?.attempts[0]?.attemptId).toBe("attempt.5");
  });

  it("cuts each note to 600 characters and drops a note with nothing left", async () => {
    const store = inMemory();
    await store.update("project.1", "task.a", withNote({ worked: "a".repeat(2000), quirks: "the desk closes early" }));
    await store.update("project.1", "task.a", withNote({ worked: "   ", failed: "" }, "attempt.2"));
    const kept = await store.get("project.1", "task.a");
    expect(kept?.notes).toHaveLength(1);
    expect(kept?.notes[0]?.worked).toHaveLength(600);
    expect(kept?.notes[0]?.quirks).toBe("the desk closes early");
  });

  it("screens a value shaped like a key out of a note", async () => {
    const store = inMemory();
    const fake = ["sk", "-", "ant", "-", "api03", "-", "A1b2C3d4E5f6G7h8I9j0", "K1l2M3n4O5p6"].join("");
    await store.update("project.1", "task.a", withNote({ worked: `log in with ${fake} then open the desk`, failed: fake }));
    const kept = await store.get("project.1", "task.a");
    expect(JSON.stringify(kept)).not.toContain(fake);
    expect(kept?.notes[0]?.failed).toBeUndefined();
  });

  it("answers where an attempt lives and how it began", async () => {
    const store = inMemory();
    await store.update("project.1", "task.a", withAttempt("attempt.1", "flow.9"));
    await expect(store.attemptLocation("project.1", "attempt.1")).resolves.toEqual({ taskId: "task.a", flowId: "flow.9" });
    await expect(store.attemptLocation("project.2", "attempt.1")).resolves.toBeUndefined();
    await expect(store.attemptLocation("project.1", "attempt.none")).resolves.toBeUndefined();
    await expect(store.provenance("project.1", "attempt.1")).resolves.toMatchObject({ attemptId: "attempt.1", route: "build" });
    await expect(store.provenance("project.1", "attempt.none")).resolves.toBeUndefined();
  });

  it("keeps a task's acts, and leaves off only acts that do not read: the rest of its memory stands", async () => {
    const { store, tasks } = await onDisk();
    const data = { kind: "attempt_act_record" as const, schemaVersion: 1 as const, acts: [], rows: [] };
    await store.update("project.1", "task.a", (memory) => ({ ...withAttempt("attempt.1")(memory), acts: { attemptId: "attempt.1", flowId: "flow.1", data } }));
    await expect(store.get("project.1", "task.a")).resolves.toMatchObject({ acts: { attemptId: "attempt.1", flowId: "flow.1", data } });
    const file = path.join(tasks, "task.a.json");
    await writeFile(file, (await readFile(file, "utf8")).replace("\"attempt_act_record\"", "\"something else\""));
    const read = await store.get("project.1", "task.a");
    expect(read?.acts).toBeUndefined();
    expect(read?.attempts.map((attempt) => attempt.attemptId)).toEqual(["attempt.1"]);
  });

  it("keeps a task's own humanness level, a stored 0 included, and round-trips it from a new store", async () => {
    const { store, paths } = await onDisk();
    await store.update("project.1", "task.a", (memory) => ({ ...withAttempt("attempt.1")(memory), humanness: 40 }));
    await store.update("project.1", "task.b", (memory) => ({ ...withAttempt("attempt.2")(memory), humanness: 0 }));
    const again = new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS);
    await expect(again.get("project.1", "task.a")).resolves.toMatchObject({ humanness: 40 });
    await expect(again.get("project.1", "task.b")).resolves.toMatchObject({ humanness: 0 });
    expect((await again.list("project.1")).map((memory) => memory.humanness)).toEqual([40, 0]);
    // A later write that leaves it as it is keeps it.
    await again.update("project.1", "task.a", withAttempt("attempt.3"));
    await expect(again.get("project.1", "task.a")).resolves.toMatchObject({ humanness: 40 });
  });

  it("serializes distinct execution records without losing one, and keeps them beyond the provenance window", async () => {
    const { store, paths } = await onDisk();
    const data = { kind: "attempt_act_record" as const, schemaVersion: 1 as const, acts: [], rows: [] };
    const scopes = ["__proto__", "constructor", ...Array.from({ length: 10 }, (_, at) => `scope.${at}`)];
    await Promise.all(scopes.map((scope) => store.update("project.1", "task.a", (memory) => ({
      ...memory, actsByScope: { ...memory.actsByScope, [scope]: { attemptId: `attempt.${scope}`, flowId: "flow.1", data } }
    }))));
    await store.update("project.1", "task.a", (memory) => ({ ...memory, attempts: Array.from({ length: 105 }, (_, at) => provenance(`later.${at}`)) }));
    const again = new AutomationStudioAnswerFirstTaskMemoryStore(paths, PROJECTS);
    const kept = await again.get("project.1", "task.a");
    expect(kept?.attempts).toHaveLength(100);
    expect(Object.keys(kept?.actsByScope ?? {}).sort()).toEqual([...scopes].sort());
    for (const scope of scopes) expect(kept?.actsByScope?.[scope]).toEqual({ attemptId: `attempt.${scope}`, flowId: "flow.1", data });
  });

  it("reads each execution record independently and preserves legacy task files", async () => {
    const { store, tasks } = await onDisk();
    const data = { kind: "attempt_act_record" as const, schemaVersion: 1 as const, acts: [], rows: [] };
    await store.update("project.1", "task.a", (memory) => ({ ...memory, actsByScope: { good: { attemptId: "attempt.1", flowId: "flow.1", data } } }));
    const file = path.join(tasks, "task.a.json");
    const written = JSON.parse(await readFile(file, "utf8"));
    written.data.memory.actsByScope.bad = { attemptId: "attempt.bad", flowId: "flow.1", data: { kind: "broken" } };
    await writeFile(file, JSON.stringify(written));
    const kept = await store.get("project.1", "task.a");
    expect(Object.keys(kept?.actsByScope ?? {})).toEqual(["good"]);
    expect(kept?.actsByScope?.good?.data).toEqual(data);
    await store.update("project.1", "task.legacy", withAttempt("attempt.legacy"));
    expect(await store.get("project.1", "task.legacy")).not.toHaveProperty("actsByScope");
  });

  it("reads and writes a task with no level exactly as before", async () => {
    const { store, tasks } = await onDisk();
    await store.update("project.1", "task.a", withAttempt("attempt.1"));
    expect(await readFile(path.join(tasks, "task.a.json"), "utf8")).not.toContain("humanness");
    expect(await store.get("project.1", "task.a")).not.toHaveProperty("humanness");
  });

  it("leaves off a level no save would take, and the rest of the task's memory stands", async () => {
    const { store, tasks } = await onDisk();
    const file = path.join(tasks, "task.a.json");
    await store.update("project.1", "task.a", (memory) => ({ ...withAttempt("attempt.1")(memory), humanness: 40 }));
    const written = await readFile(file, "utf8");
    for (const bad of ["101", "-1", "2.5", "\"x\"", "null"]) {
      await writeFile(file, written.replace(/"humanness":\s*40/u, `"humanness": ${bad}`));
      const read = await store.get("project.1", "task.a");
      expect(read, bad).not.toHaveProperty("humanness");
      expect(read?.attempts.map((attempt) => attempt.attemptId)).toEqual(["attempt.1"]);
    }
    // The next write keeps the file and drops the bad level, as it does any other field that does not read.
    await store.update("project.1", "task.a", withAttempt("attempt.2"));
    expect(await readFile(file, "utf8")).not.toContain("humanness");
    expect((await store.get("project.1", "task.a"))?.attempts.map((attempt) => attempt.attemptId)).toEqual(["attempt.1", "attempt.2"]);
  });

  it("is one store per service owner", () => {
    const ports = { paths: new AutomationStudioProjectPaths(undefined), projects: PROJECTS } as AutomationStudioAnswerFirstTaskMemoryPorts;
    const owner = {};
    expect(automationStudioAnswerFirstTaskMemoryOf(owner, ports)).toBe(automationStudioAnswerFirstTaskMemoryOf(owner, ports));
    expect(automationStudioAnswerFirstTaskMemoryOf({}, ports)).not.toBe(automationStudioAnswerFirstTaskMemoryOf(owner, ports));
  });
});
