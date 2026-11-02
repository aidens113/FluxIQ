import { expect, it } from "vitest";
import { automationStudioLlmEvidenceRuntimeBindingChecked } from "../../domain-instructions/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../harness-options/index.ts";
import { automationStudioLlmBindingFieldOrigin } from "../index.ts";

it("retains original execution and state method pairs across checked snapshots", async () => {
  class Host implements AutomationStudioLlmEvidenceRuntimeBinding {
    readonly domainId = "example";
    readonly tools = [];
    readonly deniedEvidenceKeys = [];
    readonly #value = "original private receiver";
    executeTool() { return Promise.resolve({ value: this.#value }); }
    startState() { return Promise.resolve({ state: { value: this.#value }, differs: [] }); }
  }
  const host = new Host();
  const first = automationStudioLlmEvidenceRuntimeBindingChecked(host);
  const second = automationStudioLlmEvidenceRuntimeBindingChecked(first);
  const execute = second.executeTool;
  const execution = automationStudioLlmBindingFieldOrigin(second, "executeTool", execute);
  expect(execution.receiver).toBe(host);
  expect(execution.callback).toBe(Host.prototype.executeTool);
  expect(await execution.callback.call(execution.receiver)).toEqual({ value: "original private receiver" });
  const state = second.startState;
  const read = automationStudioLlmBindingFieldOrigin(second, "startState", state);
  expect(read.receiver).toBe(host);
  expect(read.callback).toBe(Host.prototype.startState);
  expect(await read.callback.call(read.receiver)).toEqual({ state: { value: "original private receiver" }, differs: [] });
  const copied = { ...second, executeTool: execute };
  const counterfeit = automationStudioLlmBindingFieldOrigin(copied, "executeTool", copied.executeTool);
  expect(counterfeit.receiver).toBe(copied);
  expect(counterfeit.callback).toBe(execute);
});

it("does not read host getters during snapshot construction or origin lookup", () => {
  let reads = 0;
  const callback = async () => ({ state: {}, differs: [] });
  const host: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example", tools: [], deniedEvidenceKeys: [], executeTool: async () => ({}),
    get startState() {
      reads += 1;
      return callback;
    }
  };
  const snapshot = automationStudioLlmEvidenceRuntimeBindingChecked(host);
  expect(reads).toBe(0);
  const pinned = snapshot.startState;
  if (!pinned) throw new Error("test.original_callback_missing");
  const original = automationStudioLlmBindingFieldOrigin(snapshot, "startState", pinned);
  expect(reads).toBe(1);
  expect(original.receiver).toBe(snapshot);
  expect(original.callback).toBe(callback);
});
