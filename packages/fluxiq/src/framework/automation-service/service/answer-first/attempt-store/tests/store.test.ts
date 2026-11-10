// What an attempt left beside its Flow is read strictly: a person's result is either what the
// contract accepts, or a read that says it failed, and never quietly nothing.
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import { AutomationStudioAnswerFirstAttemptStore, AutomationStudioAnswerFirstAttemptsUnreadable, type AutomationStudioAnswerFirstAttemptRecord } from "../index.ts";

const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstAttemptStore>[2];
const cleanups: string[] = [];
afterEach(async () => { for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

const attempt = (attemptId: string, status: "achieved" | "working" = "achieved"): AutomationStudioTaskAttempt => ({
  taskId: "task.1", attemptId, ordinal: 1, projectId: "project.1", flowId: "flow.1", path: "explore", status,
  spend: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 0.01, ms: 1 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1,
  ...(status === "achieved" ? { endedAtMs: 2 } : {})
});
const record = (attemptId: string, status?: "achieved" | "working"): AutomationStudioAnswerFirstAttemptRecord => ({ attempt: attempt(attemptId, status), tried: { version: 1, tried: [], approaches: 0 } });

async function onDisk() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-attempts-"));
  cleanups.push(dir);
  const flows = { flowDirectory: () => dir };
  return { dir, flows, store: new AutomationStudioAnswerFirstAttemptStore({ root: dir }, flows, PROJECTS) };
}

describe("the attempt store", () => {
  it("keeps an attempt in its place by id, oldest first, and reads it back from a new store", async () => {
    const { store, dir, flows } = await onDisk();
    await store.save("project.1", "flow.1", record("attempt.1", "working"));
    await store.save("project.1", "flow.1", record("attempt.2", "working"));
    await store.save("project.1", "flow.1", record("attempt.1", "achieved"));
    const again = new AutomationStudioAnswerFirstAttemptStore({ root: dir }, flows, PROJECTS);
    expect((await again.list("project.1", "flow.1")).map((each) => [each.attempt.attemptId, each.attempt.status])).toEqual([["attempt.1", "achieved"], ["attempt.2", "working"]]);
    await expect(again.get("project.1", "flow.1", "attempt.2")).resolves.toMatchObject({ attempt: { attemptId: "attempt.2" } });
    await expect(again.latest("project.1", "flow.1")).resolves.toMatchObject({ attempt: { attemptId: "attempt.2" } });
    await expect(again.get("project.1", "flow.1", "attempt.none")).resolves.toBeUndefined();
  });

  it("takes back one attempt by its id, leaves the others, and does nothing for one it does not hold", async () => {
    const { store } = await onDisk();
    await store.save("project.1", "flow.1", record("attempt.one"));
    await store.save("project.1", "flow.1", record("attempt.two"));
    await store.remove("project.1", "flow.1", "attempt.one");
    await store.remove("project.1", "flow.1", "attempt.never");
    expect((await store.list("project.1", "flow.1")).map((each) => each.attempt.attemptId)).toEqual(["attempt.two"]);
  });

  it("keeps how a replay was checked across a new store, and reads a verdict it does not know as a file it cannot read (t897)", async () => {
    const { store, dir, flows } = await onDisk();
    await store.save("project.1", "flow.1", { ...record("attempt.1"), replay: { stood: true } });
    await store.save("project.1", "flow.1", { ...record("attempt.2"), replay: { stood: false, deviation: "act_not_done" } });
    const again = new AutomationStudioAnswerFirstAttemptStore({ root: dir }, flows, PROJECTS);
    expect((await again.list("project.1", "flow.1")).map((each) => each.replay)).toEqual([{ stood: true }, { stood: false, deviation: "act_not_done" }]);
    const name = (await readdir(dir)).find((each) => each.startsWith("answer-attempts"))!;
    await writeFile(path.join(dir, name), JSON.stringify({ kind: "answer_first_attempts", schemaVersion: 1, projectId: "project.1", flowId: "flow.1", attempts: [{ ...record("attempt.1"), replay: { stood: false, deviation: "a word nobody wrote" } }] }));
    await expect(again.list("project.1", "flow.1")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptsUnreadable);
  });

  it("lives in memory with no data root", async () => {
    const store = new AutomationStudioAnswerFirstAttemptStore({ root: undefined }, { flowDirectory: () => "" }, PROJECTS);
    await store.save("project.1", "flow.1", record("attempt.1"));
    await expect(store.latest("project.1", "flow.1")).resolves.toMatchObject({ attempt: { attemptId: "attempt.1" } });
  });

  it("says a file it cannot read is unreadable, and a save sets it aside rather than losing either", async () => {
    const { store, dir } = await onDisk();
    await store.save("project.1", "flow.1", record("attempt.1"));
    const name = (await readdir(dir)).find((each) => each.startsWith("answer-attempts"))!;
    await writeFile(path.join(dir, name), JSON.stringify({ kind: "answer_first_attempts", schemaVersion: 1, projectId: "project.1", flowId: "flow.1", attempts: [{ attempt: { ...attempt("attempt.1"), status: "failed" }, tried: { version: 1, tried: [], approaches: 0 } }] }));
    await expect(store.list("project.1", "flow.1")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptsUnreadable);
    await store.save("project.1", "flow.1", record("attempt.2"));
    expect(existsSync(path.join(dir, `${name}.unreadable`))).toBe(true);
    expect((await store.list("project.1", "flow.1")).map((each) => each.attempt.attemptId)).toEqual(["attempt.2"]);
  });
});
