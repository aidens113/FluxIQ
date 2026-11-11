// A rerun whose place could not be reached is no attempt of its input (`../outcomes.ts`, `unrun`).
//
// Live run `run-mwc60eal-4c9fdf6f` (steps 0054-0060): the put-back before `rerun.9` was refused, so the rerun was
// answered `rerun_place_unreachable` and its input never reached the target. Recorded as a failed attempt of that
// input, it made the model's identical call by hand on the same page a repeat of a failure, refused twice.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";

const UNREACHABLE = "llm_evidence_loop.rerun_place_unreachable";

/** The rerun as the loop records it: the step's input with the model's new address, refused, on the page it never left. */
const rerun = (over: Partial<AutomationStudioLlmEvidenceCallOutcome> = {}): AutomationStudioLlmEvidenceCallOutcome => ({
  callId: "rerun.9", toolId: "core.run_node", input: { node: "web.navigate", parameters: { url: "list?per=96" }, consequences: [] },
  stateBefore: "list-24", stateAfter: "list-24", effect: "mutate", proposes: true, effectApplied: false, refused: true, resultCode: UNREACHABLE, ...over
});

describe("a rerun whose place could not be reached", () => {
  it("does not block the model's identical call on the same page", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(rerun({ unrun: true }));
    expect(guard.blocks("core.run_node", rerun().input)).toBeUndefined();
  });

  it("still moves the last page seen", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(rerun({ unrun: true, stateAfter: "list-24b" }));
    expect(guard.state()).toBe("list-24b");
  });

  it("blocks as before when it is not marked unrun: an identical failed call is still a repeat (run-muq310ht)", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(rerun());
    expect(guard.blocks("core.run_node", rerun().input)).toEqual({ callId: "rerun.9", outcome: "failed", resultCode: UNREACHABLE });
  });
});
