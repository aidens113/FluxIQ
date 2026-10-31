import { describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioFlowScriptExamples } from "../../../flow-bootstrap/script-examples/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../harness-options/index.ts";
import { automationStudioLlmEvidenceRuntimeBindingChecked } from "../index.ts";

const binding = (examples: AutomationStudioFlowScriptExamples | undefined, instructions: boolean): AutomationStudioLlmEvidenceRuntimeBinding => ({
  domainId: "archive", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({}),
  ...(examples === undefined ? {} : { flowScriptExamples: examples }),
  ...(instructions ? { systemInstructions: { version: "v1", text: "Archive instructions." } } : {})
});

const malformedBinding = (examples: unknown, instructions: boolean): AutomationStudioLlmEvidenceRuntimeBinding => {
  const fixture = binding(undefined, instructions);
  Object.defineProperty(fixture, "flowScriptExamples", { value: examples, writable: true, configurable: true, enumerable: true });
  return fixture;
};

describe("examples at the runtime binding boundary", () => {
  it.each([false, true])("retains own WeakMap-backed callback receivers with examples=%s", (withExamples) => {
    const receiverState = new WeakMap<object, string>();
    const caller = binding(withExamples ? { version: "v1", act: ["archive.record"] } : undefined, false);
    caller.describeCall = function () { return { target: receiverState.get(this)! }; };
    receiverState.set(caller, "original host");
    const checked = automationStudioLlmEvidenceRuntimeBindingChecked(caller);
    const service = new AutomationStudioService().bindLlmEvidenceRuntime(caller);
    const stored = (service as unknown as { llmEvidenceRuntime: AutomationStudioLlmEvidenceRuntimeBinding }).llmEvidenceRuntime;
    const snapshots: AutomationStudioLlmEvidenceRuntimeBinding[] = [checked, stored];
    for (const snapshot of snapshots) {
      expect(snapshot.describeCall?.({ projectId: "p", flowId: "f", toolId: "tool", value: {} })).toEqual({ target: "original host" });
      expect(snapshot).not.toBe(caller);
      expect(snapshot.flowScriptExamples).toEqual(caller.flowScriptExamples);
    }
  });

  it.each([false, true])("retains inherited class callbacks and private receiver state with examples=%s", (withExamples) => {
    class HostBinding implements AutomationStudioLlmEvidenceRuntimeBinding {
      #target = "private host state";
      domainId = "archive";
      deniedEvidenceKeys: string[] = [];
      tools = [];
      declare flowScriptExamples?: AutomationStudioFlowScriptExamples;
      constructor() {
        if (withExamples) this.flowScriptExamples = { version: "v1", act: ["archive.record"] };
      }
      async executeTool() { return {}; }
      describeCall() { return { target: this.#target }; }
    }
    const caller = new HostBinding();
    const checked = automationStudioLlmEvidenceRuntimeBindingChecked(caller);
    const service = new AutomationStudioService({ llmEvidenceRuntime: caller });
    const stored = (service as unknown as { llmEvidenceRuntime: AutomationStudioLlmEvidenceRuntimeBinding }).llmEvidenceRuntime;
    const snapshots: AutomationStudioLlmEvidenceRuntimeBinding[] = [checked, stored];
    for (const snapshot of snapshots) {
      expect(snapshot.describeCall?.({ projectId: "p", flowId: "f", toolId: "tool", value: {} })).toEqual({ target: "private host state" });
      expect(snapshot.executeTool).toBeTypeOf("function");
      expect(snapshot).toBeInstanceOf(HostBinding);
    }
    caller.flowScriptExamples = { version: "later", act: ["changed"] };
    expect(checked.flowScriptExamples?.version).toBe(withExamples ? "v1" : undefined);
    expect(stored.flowScriptExamples?.version).toBe(withExamples ? "v1" : undefined);
  });

  it.each([false, true])("validates examples with systemInstructions=%s", (instructions) => {
    for (const invalid of [null, { version: "V1" }, { version: "v1", extra: [] }, { version: "v1", act: ["\t"] }, { version: "v1", act: ["x".repeat(65536)] }]) {
      expect(() => automationStudioLlmEvidenceRuntimeBindingChecked(malformedBinding(invalid, instructions))).toThrow(/flow script examples/u);
    }
    const withGetter = Object.defineProperty(binding(undefined, instructions), "flowScriptExamples", { get: () => { throw new Error("getter executed"); } });
    expect(() => automationStudioLlmEvidenceRuntimeBindingChecked(withGetter)).toThrow(/data field/u);
  });

  it("copies each binding independently without freezing the caller", () => {
    const authored = { version: "v1", act: ["archive.record"] };
    const caller = binding(authored, false);
    const first = automationStudioLlmEvidenceRuntimeBindingChecked(caller);
    const second = automationStudioLlmEvidenceRuntimeBindingChecked(caller);
    expect(first.flowScriptExamples).not.toBe(second.flowScriptExamples);
    expect(first.flowScriptExamples?.act).not.toBe(second.flowScriptExamples?.act);
    expect(Object.isFrozen(authored)).toBe(false);
    authored.act[0] = "changed";
    caller.flowScriptExamples = { version: "v2" };
    expect(first.flowScriptExamples?.act).toEqual(["archive.record"]);
    expect(second.flowScriptExamples?.act).toEqual(["archive.record"]);
  });

  it("does not let later caller additions bypass validation for an absent companion", () => {
    const caller = binding(undefined, false);
    const checked = automationStudioLlmEvidenceRuntimeBindingChecked(caller);
    caller.flowScriptExamples = { version: "v2", act: ["later"] };
    expect(checked.flowScriptExamples).toBeUndefined();
  });

  it("rejects malformed examples through both actual service bind entry points", () => {
    const invalid = malformedBinding({ version: "V1" }, false);
    expect(() => new AutomationStudioService({ llmEvidenceRuntime: invalid })).toThrow(/flow script examples/u);
    expect(() => new AutomationStudioService().bindLlmEvidenceRuntime(invalid)).toThrow(/flow script examples/u);
  });

  it("stores independent immutable examples in constructor and rebind paths", () => {
    const authored = { version: "v1", act: ["archive.record"] };
    const caller = binding(authored, false);
    const first = new AutomationStudioService({ llmEvidenceRuntime: caller });
    const second = new AutomationStudioService().bindLlmEvidenceRuntime(caller);
    // Observe the actual private store without adding a product inspection API.
    const stored = (service: AutomationStudioService) => (service as unknown as { llmEvidenceRuntime: AutomationStudioLlmEvidenceRuntimeBinding }).llmEvidenceRuntime.flowScriptExamples;
    expect(stored(first)).not.toBe(stored(second));
    authored.act[0] = "changed";
    caller.flowScriptExamples = { version: "v2" };
    expect(stored(first)?.act).toEqual(["archive.record"]);
    expect(stored(second)?.act).toEqual(["archive.record"]);
    expect(Object.isFrozen(stored(first)?.act)).toBe(true);
  });
});
