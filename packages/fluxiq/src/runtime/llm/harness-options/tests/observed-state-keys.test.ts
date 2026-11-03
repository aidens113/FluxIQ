// The keys a domain declares as its view of the target, carried from the
// binding to the loop and never to a provider (B1, `../../context-window.ts`).
import { describe, expect, it, vi } from "vitest";
import { automationStudioHarnessOptionBundleFromBinding, automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AutomationStudioHarnessOptionRegistry, type AutomationStudioHarnessOptionResolution } from "../registry.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "../../evidence-recall/index.ts";

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

  it("takes a member of a held object as `holder.member`, and then offers the recall beside the domain's tools (t194 w48)", () => {
    const loop = automationStudioHarnessOptionRegistry({ binding: binding(["ledgerRows", "query.rows"]) }).evidenceLoopBinding({ projectId: "p", flowId: "f" }, SCOPE);
    expect(loop.observedStateKeys).toEqual(["ledgerRows", "query.rows"]);
    expect(loop.tools.map((tool) => tool.toolId)).toEqual(["erp.inspect", AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID]);
    // Only a page declared: nothing a recall could give back, so no recall.
    const pageOnly = automationStudioHarnessOptionRegistry({ binding: binding(["ledgerRows"]) }).evidenceLoopBinding({ projectId: "p", flowId: "f" }, SCOPE);
    expect(pageOnly.tools.map((tool) => tool.toolId)).toEqual(["erp.inspect"]);
  });

  it("answers a recall from the result the domain returned, without calling the domain again", async () => {
    const declared = binding(["query.rows"]);
    (declared.executeTool as ReturnType<typeof vi.fn>).mockResolvedValue({ query: { rows: [1, 2, 3], count: 3 } });
    const loop = automationStudioHarnessOptionRegistry({ binding: declared }).evidenceLoopBinding({ projectId: "p", flowId: "f" }, SCOPE);
    await loop.executeTool({ callId: "read.1", toolId: "erp.inspect", value: {} });
    const answer = await loop.executeTool({ callId: "recall.2", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "read.1" } });
    expect(declared.executeTool).toHaveBeenCalledTimes(1);
    expect(answer).toMatchObject({ evidence: { recalled: "read.1", restored: { query: { rows: [1, 2, 3] } } } });
  });

  it("refuses a declaration that is not a list of plain property names", () => {
    for (const keys of [["ledger rows"], [""], ["a.b.c"], [".rows"], ["query."], Array.from({ length: 33 }, (_, index) => `k${index}`), "ledgerRows"]) {
      const bundle = { ...automationStudioHarnessOptionBundleFromBinding(binding()), observedStateKeys: keys as readonly string[] };
      expect(() => new AutomationStudioHarnessOptionRegistry().register(bundle), JSON.stringify(keys)).toThrow("observed state keys are invalid");
    }
  });
});
