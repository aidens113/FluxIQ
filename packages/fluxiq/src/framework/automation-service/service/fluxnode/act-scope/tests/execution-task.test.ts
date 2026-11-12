// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../../../../../persistence/program-state/storage.ts";
import { fluxNodeCallerKey } from "../../caller-key.ts";
import { fluxNodeExecutionTask } from "../execution-task.ts";

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });
const identity = { projectId: "p", name: "library.save", specHash: "hash", scope: "execution.opaque" };
async function file() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "fluxiq-execution-task-"));
  folders.push(folder);
  return path.join(folder, "execution.json");
}

it("retains the original task binding instead of reselecting after pin state changes", async () => {
  const target = await file();
  const original = fluxNodeCallerKey(identity);
  const choose = vi.fn(async () => original);
  expect(await fluxNodeExecutionTask({ file: target, identity, choose })).toEqual({ taskKey: original });
  const changed = vi.fn(async () => fluxNodeCallerKey({ ...identity, pinned: true }));
  expect(await fluxNodeExecutionTask({ file: target, identity, choose: changed })).toEqual({ taskKey: original });
  expect(choose).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
  expect(await new ProgramJsonStore(target, () => ({})).read()).toEqual({ kind: "fluxnode_execution_task", schemaVersion: 1, ...identity, taskKey: original });
});

it("refuses conflicting resolved targets and corrupt bindings with the original cause", async () => {
  const target = await file();
  const choose = async () => fluxNodeCallerKey(identity);
  await fluxNodeExecutionTask({ file: target, identity, choose });
  const conflict = await fluxNodeExecutionTask({ file: target, identity: { ...identity, specHash: "other" }, choose });
  expect(conflict).toHaveProperty("problem");
  if (!("problem" in conflict)) throw new Error("Expected a configuration problem.");
  expect(conflict.problem.cause).toBeInstanceOf(Error);
  await new ProgramJsonStore(target, () => ({})).write({ kind: "fluxnode_execution_task", schemaVersion: 1, ...identity, taskKey: "unrelated-task" });
  const corrupt = await fluxNodeExecutionTask({ file: target, identity, choose });
  expect(corrupt).toHaveProperty("problem");
  expect(await new ProgramJsonStore(target, () => ({})).read()).toMatchObject({ taskKey: "unrelated-task" });
});

it("keeps rootless binding ownership on the service without creating storage", async () => {
  const owner = {};
  const original = fluxNodeCallerKey(identity);
  const first = await fluxNodeExecutionTask({ owner, identity, choose: async () => original });
  expect(first).toEqual({ taskKey: original });
  expect(await fluxNodeExecutionTask({ owner, identity, choose: async () => fluxNodeCallerKey({ ...identity, pinned: true }) })).toEqual(first);
});

it("refuses changed or missing pipeline target manifests rather than inferring another child execution", async () => {
  const target = await file();
  const choose = async () => fluxNodeCallerKey(identity);
  const first = await fluxNodeExecutionTask({ file: target, identity: { ...identity, targets: { "library.child": "old" } }, choose });
  expect(first).toEqual({ taskKey: fluxNodeCallerKey(identity), targets: { "library.child": "old" } });
  expect(await fluxNodeExecutionTask({ file: target, identity: { ...identity, targets: { "library.child": "new" } }, choose })).toHaveProperty("problem");
  const legacy = await file();
  await fluxNodeExecutionTask({ file: legacy, identity, choose });
  expect(await fluxNodeExecutionTask({ file: legacy, identity: { ...identity, targets: {} }, choose })).toHaveProperty("problem");
});
