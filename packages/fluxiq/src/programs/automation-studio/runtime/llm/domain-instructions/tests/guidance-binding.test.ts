import { describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../harness-options/index.ts";
import { automationStudioLlmEvidenceRuntimeBindingChecked as checked } from "../index.ts";

const binding = (): AutomationStudioLlmEvidenceRuntimeBinding => ({ domainId: "archive", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({}) });
const stored = (service: AutomationStudioService) => (service as unknown as { llmEvidenceRuntime: AutomationStudioLlmEvidenceRuntimeBinding }).llmEvidenceRuntime;

describe("guidance at the actual binding boundary", () => {
  it.each([false, true])("validates guidance independently with other metadata=%s", (companions) => {
    const caller = binding();
    if (companions) {
      caller.flowScriptExamples = { version: "v1", act: ["x".repeat(64000)] };
      caller.systemInstructions = { version: "v1", text: "x".repeat(4000) };
    }
    caller.flowScriptGuidance = { version: "v1", act: { controlOperations: ["x".repeat(64000)] } };
    expect(checked(caller).flowScriptGuidance).toEqual(caller.flowScriptGuidance);
    Object.defineProperty(caller, "flowScriptGuidance", { value: { version: "V1" } });
    expect(() => checked(caller)).toThrow(/flow script guidance/u);
    expect(() => new AutomationStudioService({ llmEvidenceRuntime: caller })).toThrow(/flow script guidance/u);
    expect(() => new AutomationStudioService().bindLlmEvidenceRuntime(caller)).toThrow(/flow script guidance/u);
  });
  it("rejects own getters and inherited metadata before reading it", () => {
    const caller = binding();
    Object.defineProperty(caller, "flowScriptGuidance", { get: () => { throw new Error("executed"); } });
    expect(() => checked(caller)).toThrow(/data field/u);
    expect(() => checked(Object.assign(Object.create({ flowScriptGuidance: { version: "v1" } }), binding()))).toThrow(/own data field/u);
  });
  it.each([false, true])("snapshots present=%s on both service paths and prevents late additions/mutation", (present) => {
    const caller = binding();
    const authored = { version: "v1", act: { controlOperations: ["archive operation"] } };
    if (present) caller.flowScriptGuidance = authored;
    const first = stored(new AutomationStudioService({ llmEvidenceRuntime: caller }));
    const second = stored(new AutomationStudioService().bindLlmEvidenceRuntime(caller));
    authored.act.controlOperations[0] = "mutated";
    caller.flowScriptGuidance = { version: "later" };
    for (const snapshot of [first, second]) {
      expect(snapshot.flowScriptGuidance).toEqual(present ? { version: "v1", act: { controlOperations: ["archive operation"] } } : undefined);
      expect(Object.getOwnPropertyDescriptor(snapshot, "flowScriptGuidance")).toMatchObject({ writable: false, configurable: false });
    }
    if (present) expect(first.flowScriptGuidance).not.toBe(second.flowScriptGuidance);
  });
  it("preserves prototype/private/WeakMap callback receivers with guidance present", () => {
    const state = new WeakMap<object, string>();
    class Host implements AutomationStudioLlmEvidenceRuntimeBinding {
      #target = "private";
      domainId = "archive"; deniedEvidenceKeys = []; tools = [];
      flowScriptGuidance = { version: "v1", act: { controlOperations: ["archive operation"] } };
      async executeTool() { return { target: this.#target, state: state.get(this)! }; }
    }
    const host = new Host();
    state.set(host, "weak");
    const snapshot = checked(host);
    return expect(snapshot.executeTool()).resolves.toEqual({ target: "private", state: "weak" });
  });
});
