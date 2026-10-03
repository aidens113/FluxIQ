import { describe, expect, it } from "vitest";
import { adaptationApplication } from "../application-state";

const judged = (decision: Record<string, unknown>, status = "validated") => ({ status, metadata: { approvalDecision: { autoApply: true, applyAt: "judged_whole_run", ...decision } } });

describe("whether a runtime patch is in the Flow", () => {
  it("says an applied patch was applied, and that a reverted one was taken back out", () => {
    expect(adaptationApplication(judged({ applied: true }, "applied"))).toMatchObject({ state: "applied", title: "Applied to the Flow", detail: "A whole run from the Flow's start used this change and its result was judged to answer the request." });
    expect(adaptationApplication(judged({ applied: true }, "reverted"))?.detail).toContain("It was reverted later.");
  });

  it("says a held-back patch was not applied, with each recorded reason in plain words", () => {
    const reasons = ["not_rerun", "run_cancelled", "run_failed", "refuted", "not_judged", "run_parked", "run_errored", "apply_failed"];
    const details = reasons.map((reason) => adaptationApplication(judged({ applied: false, notAppliedReason: reason })));
    for (const [index, application] of details.entries()) {
      expect(application).toMatchObject({ state: "not_applied", title: "Not applied to the Flow" });
      expect(application?.detail).not.toContain(reasons[index]);
    }
    expect(new Set(details.map((application) => application?.detail)).size).toBe(reasons.length);
    expect(details[3]?.detail).toBe("The run that tried this change reached the end of the Flow, but its result was judged not to answer the request.");
  });

  it("adds the Flow's refusal to a failed apply, and a later manual apply to a held-back patch", () => {
    expect(adaptationApplication(judged({ applied: false, notAppliedReason: "apply_failed", error: "The change is destructive." }))?.detail).toContain("The Flow said: The change is destructive.");
    expect(adaptationApplication(judged({ applied: false, notAppliedReason: "refuted" }, "applied"))?.detail).toContain("A person applied it later through review.");
  });

  it("names a reason it does not know rather than hiding it, and says when the judged run is still to come", () => {
    expect(adaptationApplication(judged({ applied: false, notAppliedReason: "something_new" }))?.detail).toContain("(something_new)");
    expect(adaptationApplication(judged({ applied: false }))).toMatchObject({ state: "waiting", title: "Waiting for a judged run" });
  });

  it("gives the Current Decision heading and an inbox row words that agree with each state", () => {
    expect(adaptationApplication(judged({ applied: true }, "applied"))).toMatchObject({ decision: "Allowed automatically and applied", short: "Applied to the Flow" });
    expect(adaptationApplication(judged({ applied: true }, "reverted"))?.short).toBe("Applied, then reverted");
    expect(adaptationApplication(judged({ applied: false, notAppliedReason: "refuted" }))).toMatchObject({ decision: "Allowed automatically, but held back", short: "Not applied: result judged wrong" });
    expect(adaptationApplication(judged({ applied: false, notAppliedReason: "refuted" }, "applied"))?.short).toBe("Held back, then applied by a person");
    expect(adaptationApplication(judged({ applied: false }))).toMatchObject({ decision: "Allowed automatically, waiting for a judged run", short: "Waiting for a judged run" });
    for (const application of ["not_rerun", "run_cancelled", "run_failed", "refuted", "not_judged", "run_parked", "run_errored", "apply_failed"].map((reason) => adaptationApplication(judged({ applied: false, notAppliedReason: reason })))) {
      expect(application?.decision).not.toContain("Automatically allowed");
      expect(application?.short).toMatch(/^Not applied: [a-z]/);
    }
  });

  it("reads an inbox row's judgedApplication the same way as the detail's decision", () => {
    expect(adaptationApplication({ status: "validated", judgedApplication: { applied: false, notAppliedReason: "run_parked" } })).toMatchObject({ state: "not_applied", short: "Not applied: run waiting on a person" });
    expect(adaptationApplication({ status: "applied", judgedApplication: { applied: true } })).toMatchObject({ state: "applied", short: "Applied to the Flow" });
    expect(adaptationApplication({ status: "validated", judgedApplication: { applied: false } })?.state).toBe("waiting");
  });

  it("shows nothing for a decision that never recorded whether it was applied", () => {
    expect(adaptationApplication({ status: "proposed", metadata: { approvalDecision: { autoApply: false, requiresManualApproval: true } } })).toBeNull();
    expect(adaptationApplication({ status: "proposed" })).toBeNull();
    expect(adaptationApplication(null)).toBeNull();
  });
});
