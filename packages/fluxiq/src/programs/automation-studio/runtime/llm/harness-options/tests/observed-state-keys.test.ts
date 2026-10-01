// The keys a domain declares as its view of the target, carried from the
// binding to the loop and never to a provider (B1, `../../context-window.ts`).
import { describe, expect, it, vi } from "vitest";
import { automationStudioHarnessOptionBundleFromBinding, automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AutomationStudioHarnessOptionRegistry, type AutomationStudioHarnessOptionResolution } from "../registry.ts";

const DOMAIN_ID = "erp-ledger";
const SCOPE: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: DOMAIN_ID } };

function binding(observedStateKeys?: readonly string[]): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: DOMAIN_ID,
    deniedEvidenceKeys: [],
    ...(observedStateKeys ? { observedStateKeys } : {}),
    tools: [{ toolId: "erp.inspect", description: "Read the ledger records in view.", inputSchema: { type: "object" }, effect: "observe" }],
    executeTool: vi.fn(async () => ({ observed: true }))
  };
}

describe("a domain's view of its target, as declared", () => {
  it("reaches the loop beside the tools, and on no tool", () => {
    const loop = automationStudioHarnessOptionRegistry({ binding: binding(["ledgerRows", "openDialogs"]) }).evidenceLoopBinding({ projectId: "p", flowId: "f" }, SCOPE);
    expect(loop.observedStateKeys).toEqual(["ledgerRows", "openDialogs"]);
    // A provider refuses a tool carrying a key it does not know.
    expect(loop.tools.every((tool) => !("observedStateKeys" in tool))).toBe(true);
  });

  it("is absent when the domain declared none, so every result is shown whole", () => {
    for (const keys of [undefined, []]) {
      const loop = automationStudioHarnessOptionRegistry({ binding: binding(keys) }).evidenceLoopBinding({ projectId: "p", flowId: "f" }, SCOPE);
      expect(loop, String(keys)).not.toHaveProperty("observedStateKeys");
    }
  });

  it("is a domain's only where the model is offered one of its options", () => {
    // A Flow scoped to another domain is offered none of this one's options.
    const loop = automationStudioHarnessOptionRegistry({ binding: binding(["ledgerRows"]) }).evidenceLoopBinding({ projectId: "p", flowId: "f" }, { scope: { kind: "domain", domainId: "another-domain" } });
    expect(loop.tools).toEqual([]);
    expect(loop).not.toHaveProperty("observedStateKeys");
  });

  it("refuses a declaration that is not a list of plain property names", () => {
    for (const keys of [["ledger rows"], [""], Array.from({ length: 33 }, (_, index) => `k${index}`), "ledgerRows"]) {
      const bundle = { ...automationStudioHarnessOptionBundleFromBinding(binding()), observedStateKeys: keys as readonly string[] };
      expect(() => new AutomationStudioHarnessOptionRegistry().register(bundle), JSON.stringify(keys)).toThrow("observed state keys are invalid");
    }
  });
});
