import { describe, expect, it } from "vitest";
import { automationStudioLlmDecisionContextSignature } from "../index.ts";

describe("decision signature", () => {
  it("is the same for the same request written in another key order, and ignores the call id", () => {
    const first = { kind: "tool_call" as const, callId: "c1", toolId: "core.run_node", input: { actionId: "open", input: { a: 1, b: 2 } } };
    const again = { kind: "tool_call" as const, callId: "c9", toolId: "core.run_node", input: { input: { b: 2, a: 1 }, actionId: "open" } };
    expect(automationStudioLlmDecisionContextSignature(again)).toBe(automationStudioLlmDecisionContextSignature(first));
    expect(automationStudioLlmDecisionContextSignature(first)).toBe('["tool_call","core.run_node",{"actionId":"open","input":{"a":1,"b":2}}]');
  });

  it("differs by kind, tool, input, result and amendments", () => {
    const signatures = [
      automationStudioLlmDecisionContextSignature({ kind: "tool_call", toolId: "core.run_node", input: { actionId: "a" } }),
      automationStudioLlmDecisionContextSignature({ kind: "tool_call", toolId: "core.other", input: { actionId: "a" } }),
      automationStudioLlmDecisionContextSignature({ kind: "tool_call", toolId: "core.run_node", input: { actionId: "b" } }),
      automationStudioLlmDecisionContextSignature({ kind: "complete", result: { actionId: "a" } }),
      automationStudioLlmDecisionContextSignature({ kind: "amend_draft", amendments: [{ step: 1, change: "drop" }] }),
      automationStudioLlmDecisionContextSignature({ kind: "amend_draft", amendments: [{ step: 2, change: "drop" }] })
    ];
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("sorts and dedupes an unusable decision's issue codes", () => {
    expect(automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes: ["b", "a", "b"] }))
      .toBe(automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes: ["a", "b"] }));
  });
});
