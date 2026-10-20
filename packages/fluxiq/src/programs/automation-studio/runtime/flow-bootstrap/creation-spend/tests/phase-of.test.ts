// Which phase of a Flow's spend a settled call is placed under (t728).
import { describe, expect, it } from "vitest";
import { automationStudioFlowSpendPhaseOf } from "../index.ts";

describe("a settled call's phase", () => {
  it("is judge for a judge's call, wherever it was made", () => {
    expect(automationStudioFlowSpendPhaseOf({ judge: true }, { part: "creation", phase: "test" })).toBe("judge");
    expect(automationStudioFlowSpendPhaseOf({ judge: true }, { part: "reauthor" })).toBe("judge");
    expect(automationStudioFlowSpendPhaseOf({ judge: true }, undefined)).toBe("judge");
  });

  it("is placed by the step-log scope otherwise", () => {
    expect(automationStudioFlowSpendPhaseOf({ judge: false }, { part: "reauthor", phase: "read" })).toBe("reauthor");
    expect(automationStudioFlowSpendPhaseOf({ judge: false }, { part: "creation", phase: "read" })).toBe("read");
    expect(automationStudioFlowSpendPhaseOf({ judge: false }, { part: "creation", phase: "explore", round: 2 })).toBe("build");
    expect(automationStudioFlowSpendPhaseOf({ judge: false }, { part: "creation", phase: "test" })).toBe("build");
    expect(automationStudioFlowSpendPhaseOf({ judge: false }, {})).toBe("runtime");
    expect(automationStudioFlowSpendPhaseOf({ judge: false }, undefined)).toBe("runtime");
  });
});
