// @fluxiq-test-group real-sql
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmProviderResolverInput } from "../../../../../../runtime/llm/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../../../../runtime/run-overrides/index.ts";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../../task-key/index.ts";
import { automationStudioAnswerFirstRunAgainScope } from "../../run-again/index.ts";
import { AutomationStudioAnswerFirstTaskMemoryIntegrityError, AutomationStudioAnswerFirstTaskMemoryStoreError, automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../../task-memory/index.ts";
import { automationStudioAnswerFirstModelResolution } from "../index.ts";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const task = { authoringMode: "answer-first", instructionText: "List the atlases.", startLocation: "https://library.example.test/" };
const taskId = automationStudioAnswerFirstTaskKey(task);
const ports = (root?: string): AutomationStudioAnswerFirstTaskMemoryPorts => ({ paths: new AutomationStudioProjectPaths(root), projects: { ensureProjectStructure: async () => undefined } });
const request = { projectId: "p", flowId: "f", modelId: "claude-sonnet-5-5" };
function resolver(asked: string[]) {
  return async (input: AutomationStudioLlmProviderResolverInput) => {
    asked.push(input.modelId!);
    return { provider: { metadata: { provider: "mock", model: input.modelId! }, runTask: async () => ({}) } };
  };
}

describe("a task's persisted starting model", () => {
  it("ignores later explicit/role model choices for the same task and honors a distinct task key", async () => {
    const owner = {};
    const stores = ports();
    const asked: string[] = [];
    const input = { owner, stores, request, resolver: resolver(asked), ...task };
    await automationStudioAnswerFirstModelResolution(input);
    await runWithAutomationStudioRunOverrides({ models: { explore: "claude-opus-5-5", judge: "claude-opus-5-5" } }, () => automationStudioAnswerFirstModelResolution({ ...input, request: { ...request, modelId: "claude-haiku-5-5" } }));
    await automationStudioAnswerFirstModelResolution({ ...input, callerKey: "a-new-task", request: { ...request, modelId: "claude-opus-5-5" } });
    expect(asked).toEqual(["claude-sonnet-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
  });

  it("retains the model across a fresh service owner and Run again task identity", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "task-model-"));
    directories.push(root);
    await mkdir(path.join(root, "p", "task-memory"), { recursive: true });
    const stores = ports(root);
    const asked: string[] = [];
    await automationStudioAnswerFirstModelResolution({ owner: {}, stores, request, resolver: resolver(asked), ...task });
    await automationStudioAnswerFirstRunAgainScope.run({ projectId: "p", flowId: "f", taskId, attemptId: "again", opened: false }, () => automationStudioAnswerFirstModelResolution({ owner: {}, stores, request: { ...request, modelId: "claude-opus-5-5" }, resolver: resolver(asked), authoringMode: "answer-first", instructionText: "Words ignored by a real Run again.", startLocation: task.startLocation }));
    expect(asked).toEqual(["claude-sonnet-5-5", "claude-sonnet-5-5"]);
  });

  it("infers legacy state only from ordinal-one explicit caller settings", async () => {
    const owner = {};
    const stores = ports();
    const memory = automationStudioAnswerFirstTaskMemoryOf(owner, stores);
    await memory.update("p", taskId, (current) => ({ ...current, attempts: [{ attemptId: "first", flowId: "f", ordinal: 1, route: "build", steps: [], caller: { model: "claude-sonnet-5-5" } }, { attemptId: "later", flowId: "f", ordinal: 2, route: "repair", steps: [], caller: { model: "claude-opus-5-5" } }] }));
    const asked: string[] = [];
    await automationStudioAnswerFirstModelResolution({ owner, stores, request: { ...request, modelId: "claude-opus-5-5" }, resolver: resolver(asked), ...task });
    expect(asked).toEqual(["claude-sonnet-5-5"]);
    expect((await memory.get("p", taskId))?.startingModel).toBe("claude-sonnet-5-5");
  });

  it("uses the documented default rather than a later legacy escalated caller", async () => {
    const owner = {};
    const stores = ports();
    const memory = automationStudioAnswerFirstTaskMemoryOf(owner, stores);
    await memory.update("p", taskId, (current) => ({ ...current, attempts: [{ attemptId: "later", flowId: "f", ordinal: 8, route: "repair", steps: [], caller: { model: "claude-opus-5-5" } }] }));
    const asked: string[] = [];
    await automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver(asked), ...task });
    expect(asked).toEqual(["claude-haiku-5-5"]);
  });

  it("chooses one durable winner under concurrent owners rather than overwriting the first resolution", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "task-model-race-"));
    directories.push(root);
    await mkdir(path.join(root, "p", "task-memory"), { recursive: true });
    const stores = ports(root);
    const asked: string[] = [];
    const results = await Promise.all(["claude-haiku-5-5", "claude-sonnet-5-5"].map((modelId) => automationStudioAnswerFirstModelResolution({ owner: {}, stores, request: { ...request, modelId }, resolver: resolver(asked), ...task })));
    const models = results.map((result) => result?.provider.metadata.model);
    expect(models[0]).toBe(models[1]);
    const kept = await automationStudioAnswerFirstTaskMemoryOf({}, stores).get("p", taskId);
    expect(models[0]).toBe(kept?.startingModel);
  });

  it("refuses an invalid persisted model on an unscoped restart without rewriting the task or generating", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "task-model-invalid-"));
    directories.push(root);
    const folder = path.join(root, "p", "task-memory");
    await mkdir(folder, { recursive: true });
    const stores = ports(root);
    await automationStudioAnswerFirstModelResolution({ owner: {}, stores, request, resolver: resolver([]), ...task });
    const file = path.join(folder, `${taskId}.json`);
    const written = await readFile(file, "utf8");
    const corrupt = written.replace(/"startingModel"\s*:\s*"[^"]*"/u, '"startingModel": 42');
    expect(corrupt).not.toBe(written);
    await writeFile(file, corrupt);
    const generate = vi.fn(async () => ({}));
    const resolve = vi.fn(async () => ({ provider: { metadata: { provider: "mock", model: "claude-haiku-5-5" }, runTask: generate } }));
    await expect(automationStudioAnswerFirstModelResolution({ owner: {}, stores, request, resolver: resolve, ...task })).rejects.toThrow("stored task starting model is invalid");
    expect(resolve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(await readFile(file, "utf8")).toBe(corrupt);
    expect(await readdir(folder)).not.toContain(`${taskId}.json.unreadable`);
  });

  async function withBrokenStore(failure: () => Error, run: (stores: AutomationStudioAnswerFirstTaskMemoryPorts, owner: object) => Promise<void>) {
    const owner = {};
    const stores = ports();
    const memory = automationStudioAnswerFirstTaskMemoryOf(owner, stores);
    await automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver([]), ...task });
    const { get, update } = memory;
    memory.get = async () => {
      throw failure();
    };
    memory.update = async () => {
      throw failure();
    };
    try {
      await run(stores, owner);
    } finally {
      memory.get = get;
      memory.update = update;
    }
    expect((await memory.get("p", taskId))?.startingModel).toBe("claude-sonnet-5-5");
  }
  const storeFailure = () => new AutomationStudioAnswerFirstTaskMemoryStoreError("disk", { cause: Object.assign(new Error("busy"), { code: "EBUSY" }) });

  it("costs no result when unscoped memory cannot be read or written (a store failure)", async () => {
    await withBrokenStore(storeFailure, async (stores, owner) => {
      const asked: string[] = [];
      const resolved = await automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver(asked), ...task });
      // The store is unreadable, so the task's own model is unknown: the request's routed choice resolves and nothing is written.
      expect(asked).toEqual(["claude-sonnet-5-5"]);
      expect(resolved?.provider.metadata.model).toBe("claude-sonnet-5-5");
    });
  });

  it("stays strict for scoped execution when the store fails", async () => {
    await withBrokenStore(storeFailure, async (stores, owner) => {
      await expect(automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver([]), ...task, scoped: true })).rejects.toBeInstanceOf(AutomationStudioAnswerFirstTaskMemoryStoreError);
    });
  });

  it("lets a programming error from the store through instead of reading it as no memory", async () => {
    await withBrokenStore(() => new TypeError("undefined is not a function"), async (stores, owner) => {
      const asked: string[] = [];
      await expect(automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver(asked), ...task })).rejects.toBeInstanceOf(TypeError);
      expect(asked).toEqual([]);
    });
  });

  it("lets an integrity error from the store through", async () => {
    await withBrokenStore(() => new AutomationStudioAnswerFirstTaskMemoryIntegrityError("repair it"), async (stores, owner) => {
      await expect(automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver([]), ...task })).rejects.toBeInstanceOf(AutomationStudioAnswerFirstTaskMemoryIntegrityError);
    });
  });

  it("delegates other authoring modes without creating task memory", async () => {
    const owner = {};
    const stores = ports();
    const asked: string[] = [];
    await automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: resolver(asked), ...task, authoringMode: "candidate" });
    expect(asked).toEqual(["claude-sonnet-5-5"]);
    expect(await automationStudioAnswerFirstTaskMemoryOf(owner, stores).get("p", taskId)).toBeUndefined();
  });

  it("does not persist a failed provider resolution or accept an invalid model id", async () => {
    const owner = {};
    const stores = ports();
    await expect(automationStudioAnswerFirstModelResolution({ owner, stores, request, resolver: async () => { throw new Error("key unavailable"); }, ...task })).rejects.toThrow("key unavailable");
    const memory = automationStudioAnswerFirstTaskMemoryOf(owner, stores);
    expect(await memory.get("p", taskId)).toBeUndefined();
    await expect(memory.update("p", taskId, (current) => ({ ...current, startingModel: "bad model id" }))).rejects.toThrow("starting model is invalid");
  });
});
