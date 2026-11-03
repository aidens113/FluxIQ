import { describe, expect, it } from "vitest";
import { automationStudioLlmDecisionContextClosedDetail } from "../index.ts";

describe("closed detail of a refusal's feedback", () => {
  it("keeps codes and integers from the refusal and its accounts, and drops every sentence", () => {
    const detail = automationStudioLlmDecisionContextClosedDetail({
      ok: false,
      code: "flow_bootstrap.completion_refused",
      refusal: "flow_bootstrap.limits_exceeded",
      refusals: ["flow_bootstrap.limits_exceeded", "flow_bootstrap.instructed_act_missing", "not a code at all"],
      issues: [{ code: "bootstrap.invalid_plan", path: "plan", message: "The completed result was refused." }],
      previous: "click the button",
      limitsExceeded: [{ limit: "steps", allowed: 40, actual: 52, note: "too many steps in the plan" }],
      missingActs: [{ id: "pick-store", reason: "The Flow never picks the store.", position: 3 }],
      cannotReach: { target: "checkout", why: "no route to checkout" },
      instruction: "Remove steps until the Flow fits."
    });
    expect(detail).toEqual({
      code: "flow_bootstrap.completion_refused",
      refusal: "flow_bootstrap.limits_exceeded",
      refusals: ["flow_bootstrap.limits_exceeded", "flow_bootstrap.instructed_act_missing"],
      limitsExceeded: [{ limit: "steps", allowed: 40, actual: 52 }],
      missingActs: [{ id: "pick-store", position: 3 }],
      cannotReach: [{ target: "checkout" }]
    });
    expect(JSON.stringify(detail)).not.toMatch(/ /);
  });

  // No count limit: every account object and every closed field of each.
  it("keeps every account object and every closed field of each", () => {
    const acts = Array.from({ length: 12 }, (_, index) => ({ a: `a${index}`, b: 1, c: 2, d: 3, e: 4, f: 5 }));
    const detail = automationStudioLlmDecisionContextClosedDetail({ code: "x", missingActs: acts.slice(0, 6), limitsExceeded: acts.slice(6) });
    const objects = [...(detail!.missingActs as object[]), ...(detail!.limitsExceeded as object[])];
    expect(objects).toEqual(acts);
  });

  it("gives nothing for feedback with no closed code, and for no feedback", () => {
    expect(automationStudioLlmDecisionContextClosedDetail({ code: "a sentence, not a code", instruction: "Try again." })).toBeUndefined();
    expect(automationStudioLlmDecisionContextClosedDetail(undefined)).toBeUndefined();
    expect(automationStudioLlmDecisionContextClosedDetail("flow_bootstrap.completion_refused")).toBeUndefined();
  });
});
