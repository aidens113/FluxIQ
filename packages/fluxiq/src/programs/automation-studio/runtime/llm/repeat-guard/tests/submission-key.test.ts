// A candidate submission is keyed on the Flow it sends, not on its whole input
// (`../outcomes.ts`). Lane B (`run-mv0fu9pb-57454dc4`) sent the refused script
// again at 0060 without its `summary`: a new key, so it ran and was refused
// once more instead of being refused unrun as a repeat.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioLlmEvidenceRepeatGuard } from "../outcomes.ts";

const FLOW = "flow: Read the list\nstep: open it\n  node: web.browser-navigate";
const REFUSAL = JSON.stringify({ ok: false, diagnostics: { refusal: "flow_bootstrap.evidence_completion_parameters_unresolved", issues: [{ code: "web.handle.unknown", line: 3 }] } });

function refusedOnce(input: JsonObject) {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  guard.seen("s1");
  guard.recorded({ callId: "submit-flow-1", toolId: "core.submit_candidate", input, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: "flow_bootstrap.evidence_completion_parameters_unresolved", answer: REFUSAL });
  return guard;
}

describe("a candidate submission's repeat key", () => {
  it("is the same submission when only its summary differs or is left out", () => {
    const guard = refusedOnce({ summary: "Reads the list.", flow: FLOW });
    expect(guard.blocks("core.submit_candidate", { flow: FLOW })?.callId).toBe("submit-flow-1");
    expect(guard.blocks("core.submit_candidate", { summary: "Another summary.", flow: FLOW })?.callId).toBe("submit-flow-1");
  });

  it("keys a plan submission on its plan", () => {
    const plan = { subflows: [{ nodes: [{ node: "web.browser-navigate" }] }] };
    const guard = refusedOnce({ summary: "One.", plan });
    expect(guard.blocks("core.submit_candidate", { plan })?.callId).toBe("submit-flow-1");
    expect(guard.blocks("core.submit_candidate", { plan: { subflows: [] } })).toBeUndefined();
  });

  it("runs a submission whose Flow changed", () => {
    const guard = refusedOnce({ summary: "Reads the list.", flow: FLOW });
    expect(guard.blocks("core.submit_candidate", { summary: "Reads the list.", flow: `${FLOW}\n  url: https://example.test/` })).toBeUndefined();
  });

  it("still keys any other tool on its whole input", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("s1");
    guard.recorded({ callId: "c1", toolId: "core.run_node", input: { node: "web.click", summary: "a" }, effect: "mutate", proposes: false, effectApplied: false, refused: true, resultCode: "web.action.rejected.target_covered" });
    expect(guard.blocks("core.run_node", { node: "web.click" })).toBeUndefined();
  });
});
