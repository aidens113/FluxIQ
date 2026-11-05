// Where attempts are: strict on read, mended by the next save, and never a reason to lose a row.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import { AutomationStudioAnswerFirstAttemptLocator, AutomationStudioAnswerFirstAttemptLocatorUnreadable, AutomationStudioAnswerFirstAttemptStore } from "../index.ts";

const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstAttemptStore>[2];
const cleanups: string[] = [];
afterEach(async () => { for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

const attempt = (attemptId: string): AutomationStudioTaskAttempt => ({
  taskId: "task.1", attemptId, ordinal: 1, projectId: "project.1", flowId: "flow.1", path: "explore", status: "working",
  spend: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 0.01, ms: 1 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1
});
const record = (attemptId: string) => ({ attempt: attempt(attemptId), tried: { version: 1 as const, tried: [], approaches: 0 } });

async function onDisk() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-attempt-locator-"));
  cleanups.push(dir);
  const file = path.join(dir, "project.1", "indexes", "answer-attempts.json");
  return { dir, file, locator: new AutomationStudioAnswerFirstAttemptLocator({ root: dir }, PROJECTS) };
}

describe("the attempt locator", () => {
  it("finds an attempt's Flow from a new locator", async () => {
    const { dir, locator } = await onDisk();
    await locator.noteAttempt("project.1", "attempt.1", "flow.1");
    const again = new AutomationStudioAnswerFirstAttemptLocator({ root: dir }, PROJECTS);
    await expect(again.flowOfAttempt("project.1", "attempt.1")).resolves.toBe("flow.1");
    await expect(again.flowOfAttempt("project.1", "attempt.none")).resolves.toBeUndefined();
    await expect(again.flowOfAttempt("project.none", "attempt.1")).resolves.toBeUndefined();
  });

  it("writes an attempt once however often its row is saved", async () => {
    const { file, locator } = await onDisk();
    await locator.noteAttempt("project.1", "attempt.1", "flow.1");
    const written = await readFile(file, "utf8");
    await rm(file);
    await locator.noteAttempt("project.1", "attempt.1", "flow.1");
    expect(existsSync(file)).toBe(false);
    expect(written).toContain("attempt.1");
  });

  it("says a thread keeps a Flow it noted again, and gives way when another thread takes it", async () => {
    const { locator } = await onDisk();
    await locator.noteConversation("project.1", "conversation.1", "flow.1");
    const [first] = await locator.flowsOfConversation("project.1", "conversation.1");
    await locator.noteConversation("project.1", "conversation.1", "flow.1");
    expect(await locator.flowsOfConversation("project.1", "conversation.1")).toEqual([first]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await locator.noteConversation("project.1", "conversation.2", "flow.1");
    const [taken] = await locator.flowsOfConversation("project.1", "conversation.1");
    const [taker] = await locator.flowsOfConversation("project.1", "conversation.2");
    expect(taken?.untilMs).toBe(taker?.sinceMs);
    expect(taker?.untilMs).toBeUndefined();
  });

  it("holds its writes in order, so no note is lost to another", async () => {
    const { locator } = await onDisk();
    await Promise.all(Array.from({ length: 12 }, (_, index) => locator.noteAttempt("project.1", `attempt.${index}`, `flow.${index}`)));
    for (let index = 0; index < 12; index += 1) await expect(locator.flowOfAttempt("project.1", `attempt.${index}`)).resolves.toBe(`flow.${index}`);
  });

  it("refuses to read a file it cannot, and the next note sets it aside and starts again", async () => {
    const { file, locator } = await onDisk();
    await locator.noteAttempt("project.1", "attempt.1", "flow.1");
    await writeFile(file, "not json at all");
    await expect(locator.flowOfAttempt("project.1", "attempt.1")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptLocatorUnreadable);
    await expect(locator.flowsOfConversation("project.1", "conversation.1")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptLocatorUnreadable);
    await locator.noteAttempt("project.1", "attempt.2", "flow.1");
    expect(existsSync(`${file}.unreadable`)).toBe(true);
    await expect(locator.flowOfAttempt("project.1", "attempt.2")).resolves.toBe("flow.1");
  });

  it("lives in memory with no data root", async () => {
    const locator = new AutomationStudioAnswerFirstAttemptLocator({ root: undefined }, PROJECTS);
    await locator.noteAttempt("project.1", "attempt.1", "flow.1");
    await locator.noteConversation("project.1", "conversation.1", "flow.1");
    await expect(locator.flowOfAttempt("project.1", "attempt.1")).resolves.toBe("flow.1");
    expect((await locator.flowsOfConversation("project.1", "conversation.1")).map((flow) => flow.flowId)).toEqual(["flow.1"]);
  });
});

describe("the store's save", () => {
  it("notes the attempt with its row", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-attempt-locator-"));
    cleanups.push(dir);
    const store = new AutomationStudioAnswerFirstAttemptStore({ root: dir }, { flowDirectory: () => dir }, PROJECTS);
    await store.save("project.1", "flow.1", record("attempt.1"));
    await expect(store.locator.flowOfAttempt("project.1", "attempt.1")).resolves.toBe("flow.1");
  });

  it("keeps the row when the locator cannot be written, and says so to the caller, which tries again next save", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-attempt-locator-"));
    cleanups.push(dir);
    const store = new AutomationStudioAnswerFirstAttemptStore({ root: dir }, { flowDirectory: () => dir }, PROJECTS);
    // A file where the project's directory should be: nothing can be written under it.
    await writeFile(path.join(dir, "project.1"), "in the way");
    await expect(store.save("project.1", "flow.1", record("attempt.1"))).rejects.toBeDefined();
    await expect(store.get("project.1", "flow.1", "attempt.1")).resolves.toMatchObject({ attempt: { attemptId: "attempt.1" } });
    await rm(path.join(dir, "project.1"));
    await store.save("project.1", "flow.1", record("attempt.1"));
    await expect(store.locator.flowOfAttempt("project.1", "attempt.1")).resolves.toBe("flow.1");
  });
});
