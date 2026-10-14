// A key named `code` is not code (`../output-validation.ts`, t587). A8 launch 6 (`run-mv85vjqo-4c022aec`, steps 68-69):
// a dispatch carrying `failingReceipt: {code, reason}` was refused `llm_output.executable_code` before it ran.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { validateAutomationStudioLlmOutput } from "../output-validation.ts";

const decision = (input: JsonObject) => validateAutomationStudioLlmOutput({
  kind: "evidence_tool_decision",
  summary: "Dispatch the brief again.",
  decision: { kind: "tool_call", callId: "c1", toolId: "project.dispatch", input }
}, "evidence_tool_decision").map((diagnostic) => diagnostic.code);

const proposal = (after: JsonObject) => validateAutomationStudioLlmOutput({
  kind: "change_proposal",
  summary: "Patch.",
  riskLevel: "high",
  patches: [{ kind: "edit_router", targetId: "router.checkout", summary: "Change route", after }]
}, "change_proposal").map((diagnostic) => diagnostic.code);

describe("executable code in a model's output", () => {
  it("lets a key named code or script hold a result code, an id or a number (run-mv85vjqo, 68-69)", () => {
    expect(decision({ briefs: [{ kind: "repair", failingReceipt: { code: "flow_bootstrap.evidence_repeat_without_progress", reason: "The builder stalled." } }] })).not.toContain("llm_output.executable_code");
    expect(decision({ issues: [{ code: "web.action.rejected.not_at_start_location", path: "briefs.0" }], script: "checkout-v2", status: { code: 404 }, tags: { code: ["a.b", "c:d/e"] } })).not.toContain("llm_output.executable_code");
  });

  it("still refuses code under those keys, and anything under a key that names a language or a function body", () => {
    expect(proposal({ code: "eval('nope')" })).toContain("llm_output.executable_code");
    expect(decision({ nested: [{ script: "document.querySelector('#buy').click()" }] })).toContain("llm_output.executable_code");
    expect(decision({ code: ["ok", "return window.location"] })).toContain("llm_output.executable_code");
    expect(decision({ code: { inner: { code: "x => x" } } })).toContain("llm_output.executable_code");
    for (const key of ["functionBody", "javascript", "typescript"]) {
      expect(decision({ [key]: "run" }), key).toContain("llm_output.executable_code");
      expect(decision({ [key]: { body: "x" } }), key).toContain("llm_output.executable_code");
    }
  });
});
