// What a task keeps of the Flows it saved under: the last 20, and a base it cannot read is left off
// with the rest of the memory standing, since a Flow with none is only ever given one while blank.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { AutomationStudioAnswerFirstTaskMemoryStore } from "../index.ts";

const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstTaskMemoryStore>[1];
const cleanups: string[] = [];
afterEach(async () => { for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

async function onDisk() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bases-"));
  cleanups.push(dir);
  const tasks = path.join(dir, "project.1", "task-memory");
  await mkdir(tasks, { recursive: true });
  return { file: path.join(tasks, "task.a.json"), store: new AutomationStudioAnswerFirstTaskMemoryStore(new AutomationStudioProjectPaths(dir), PROJECTS) };
}

describe("a task's Flow bases", () => {
  it("round-trip with what was applied, and keep the last 20", async () => {
    const { store } = await onDisk();
    const many = Array.from({ length: 25 }, (_, index) => ({ flowId: `flow.${index}`, digest: `digest.${index}` }));
    await store.update("project.1", "task.a", (current) => ({ ...current, flowId: "flow.1", flowBases: [...many, { flowId: "flow.last", digest: "d", applied: { attemptId: "attempt.2", adaptationId: "adaptation.1", stepsDigest: "s", atMs: 1 } }] }));
    const kept = await store.get("project.1", "task.a");
    expect(kept?.flowBases).toHaveLength(20);
    expect(kept?.flowBases?.at(-1)).toEqual({ flowId: "flow.last", digest: "d", applied: { attemptId: "attempt.2", adaptationId: "adaptation.1", stepsDigest: "s", atMs: 1 } });
  });

  it("a base that does not read is left off, and everything else the task kept stands", async () => {
    const { store, file } = await onDisk();
    await store.update("project.1", "task.a", (current) => ({ ...current, flowId: "flow.1", flowBases: [{ flowId: "flow.1", digest: "d" }] }));
    const held = JSON.parse(await readFile(file, "utf8")) as { data: { memory: { flowBases: unknown } } };
    held.data.memory.flowBases = [{ flowId: 7 }, null, { flowId: "flow.1", digest: 9 }, { flowId: "flow.2", digest: "kept" }];
    await writeFile(file, JSON.stringify(held));
    await expect(store.get("project.1", "task.a")).resolves.toMatchObject({ flowId: "flow.1", flowBases: [{ flowId: "flow.2", digest: "kept" }] });
    held.data.memory.flowBases = "not a list";
    await writeFile(file, JSON.stringify(held));
    const kept = await store.get("project.1", "task.a");
    expect(kept?.flowId).toBe("flow.1");
    expect(kept?.flowBases).toBeUndefined();
  });

  it("a memory written before there were bases reads as having none", async () => {
    const { store } = await onDisk();
    await store.update("project.1", "task.a", (current) => ({ ...current, flowId: "flow.1" }));
    const kept = await store.get("project.1", "task.a");
    expect(kept).toMatchObject({ flowId: "flow.1" });
    expect(kept?.flowBases).toBeUndefined();
  });
});
