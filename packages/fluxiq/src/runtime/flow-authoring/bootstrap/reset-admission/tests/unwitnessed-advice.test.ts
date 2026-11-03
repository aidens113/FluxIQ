import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import type { AutomationStudioSiteResetStepGap } from "../index.ts";
import { automationStudioCandidateUnwitnessedAdvice as adviceOf } from "../unwitnessed-advice.ts";

// What an accepted submission says of its steps with no witness (t791 fix 2): advice, one line per such step, by label.

const plan = { subflows: [{ key: "main", nodes: [{ key: "s1", label: "keep the book" }, { key: "s2" }, { key: "s3", label: "return it" }] }] } as unknown as AutomationStudioFlowBootstrapPlan;
const permissionFor = (gaps: Record<string, AutomationStudioSiteResetStepGap>) => Object.assign(() => ({}), { gaps: () => new Map(Object.entries(gaps)) });

describe("the advice an accepted submission carries for steps with no witness", () => {
  it("names each such step by label or number, in plan order, with how to give it a place or that none can be made", () => {
    const advice = adviceOf(plan, permissionFor({
      "main.s3": { canMeet: "no_call", instruction: "No call in the tab this step acts in can give Core a place." },
      "main.s1": { canMeet: "another_page", instruction: "Name where this step's change shows." },
      "other.s9": { canMeet: "no_call", instruction: "Not in this plan." }
    }));
    expect(advice).toEqual([
      "The step \"keep the book\" (plan step 1) changes something on the site and has no place named that shows its change. Name where this step's change shows.",
      "The step \"return it\" (plan step 3) changes something on the site and has no place named that shows its change. No call in the tab this step acts in can give Core a place."
    ]);
    expect(adviceOf(plan, permissionFor({ "main.s2": { canMeet: "no_call", instruction: "X" } }))[0]).toContain("The step plan step 2 ");
  });

  it("says nothing without a check that notes gaps, or with none noted", () => {
    expect(adviceOf(plan, undefined)).toEqual([]);
    expect(adviceOf(plan, () => ({}))).toEqual([]);
    expect(adviceOf(plan, permissionFor({}))).toEqual([]);
  });
});
