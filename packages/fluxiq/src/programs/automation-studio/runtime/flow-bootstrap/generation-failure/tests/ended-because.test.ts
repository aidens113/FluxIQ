// Why a project build's supervisor ended it (`endedBecause`, t649): read back by its bounds, and only
// beside the supervisor's ending it explains. The person read "the supervisor ended it because it
// could not finish the Flow" and never why (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, 00048).
import { describe, expect, it } from "vitest";
import { flowBootstrapPhaseFailure, MAX_DIAGNOSTIC_ENDED_BECAUSE, parseAutomationStudioFlowBootstrapFailureDiagnostic } from "../index.ts";

const ACCOUNTING = { requestId: "request.ended", estimatedInputTokens: 100 };
const failure = (issueCodes?: string[]) => {
  const { diagnostic } = flowBootstrapPhaseFailure("post_provider_validation", ACCOUNTING, "flow_bootstrap.post_provider_validation_failed");
  return issueCodes ? { ...diagnostic, issueCodes } : diagnostic;
};
const WHY = "The item can't be collected from this branch, so the task cannot be done.";

describe("a supervisor's reason for ending a build, on its failure", () => {
  it("reads back beside a supervisor's ending, as written", () => {
    for (const ending of ["project.build_blocked", "project.build_partial"]) {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...failure([ending]), endedBecause: WHY })?.endedBecause).toBe(WHY);
    }
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(failure(["project.build_blocked"]))).not.toHaveProperty("endedBecause");
  });

  it("is refused beside no supervisor's ending, empty, on two lines, too long, or not words", () => {
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...failure(), endedBecause: WHY })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...failure(["project.build_time_limit"]), endedBecause: WHY })).toBeNull();
    for (const bad of ["   ", "one\ntwo", "x".repeat(MAX_DIAGNOSTIC_ENDED_BECAUSE + 1), 7]) {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...failure(["project.build_blocked"]), endedBecause: bad })).toBeNull();
    }
  });
});
