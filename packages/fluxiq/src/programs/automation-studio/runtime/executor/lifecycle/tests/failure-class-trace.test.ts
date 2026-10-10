import { describe, expect, it } from "vitest";
import { automationStudioTraceFailureClass } from "../failure-class-trace.ts";
import type { AutomationStudioFailureClass } from "../true-failure.ts";

describe("the failure class a trace records", () => {
  it("maps every recorded verdict to the trace's closed vocabulary", () => {
    const cases: Array<[AutomationStudioFailureClass, string]> = [
      ["true_failure", "true_failure"],
      ["planned_fail", "planned_fail"],
      ["retry_superseded", "retry"],
      ["skip", "skip"],
      ["state_route", "state_route"],
      ["outcome_uncertain", "uncertain"]
    ];
    for (const [verdict, recorded] of cases) expect(automationStudioTraceFailureClass(verdict)).toBe(recorded);
  });

  it("records a deliberate stop as a planned fail, never a failure", () => {
    expect(automationStudioTraceFailureClass("deliberate_stop")).toBe("planned_fail");
  });

  it("never records an On Fail handler still pending dispatch", () => {
    expect(automationStudioTraceFailureClass("on_fail_pending")).toBeUndefined();
  });
});
