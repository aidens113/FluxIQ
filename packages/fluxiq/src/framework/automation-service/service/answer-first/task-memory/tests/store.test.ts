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
  it("round-trips on disk, one file per task under the project, and reads back from a new store", async () => {
    const { store, paths, tasks } = await onDisk();
    await store.update("project.1", "task.a", withAttempt("attempt.1"));
    await store.update("project.1", "task.b", withAttempt("attempt.2"));
    expect((await readdir(tasks)).sort()).toEqual(["attempt-index.json", "task.a.json", "task.b.json"]);
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
    expect((await readdir(tasks)).sort()).toEqual(["attempt-index.json", "attempt-index.json.unreadable", "task.a.json", "task.a.json.unreadable"]);
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
