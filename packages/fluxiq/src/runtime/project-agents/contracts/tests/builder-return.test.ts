import { describe, expect, it } from "vitest";
import { automationStudioProjectBuilderReturn } from "../index.ts";
import { brief, builderReturn } from "../../tests/fixtures.ts";

const parse = automationStudioProjectBuilderReturn.parse;
const issues = automationStudioProjectBuilderReturn.issues;

describe("builder return", () => {
  it("parses a good return unchanged and binds it to its brief", () => {
    expect(parse(builderReturn())).toEqual({ status: "valid", value: builderReturn() });
    expect(issues(builderReturn(), brief())).toEqual([]);
  });

  it.each([
    ["an unknown outcome", (value: ReturnType<typeof builderReturn>) => (value.outcome = "great" as "done"), "project.invalid_choice"],
    ["negative spend", (value: ReturnType<typeof builderReturn>) => (value.spentUsd = -1), "project.invalid_amount"],
    ["fractional calls", (value: ReturnType<typeof builderReturn>) => (value.calls = 1.5), "project.invalid_count"],
    ["a malformed trial reference", (value: ReturnType<typeof builderReturn>) => (value.trials = [{ kind: "subflow_trial", receiptId: "r", digest: "short" }]), "project.invalid_digest"],
    ["its own history", (value: ReturnType<typeof builderReturn>) => Object.assign(value, { history: [] }), "project.unknown_field"]
  ])("refuses %s", (_name, change, code) => {
    const value = builderReturn();
    change(value);
    expect(parse(value)).toMatchObject({ status: "invalid", code });
  });

  // t606: a listed trial carries its verdict and stored rows beside its reference, which is read as ever.
  it("reads a trial's verdict and stored rows beside its reference, and refuses either malformed", () => {
    const listed = { kind: "subflow_trial" as const, receiptId: "trial-2", digest: "c".repeat(64), verdict: "unsure" as const, rows: 9 };
    expect(parse(builderReturn((value) => (value.trials = [listed])))).toMatchObject({ status: "valid", value: { trials: [listed] } });
    expect(parse(builderReturn((value) => (value.trials = [{ ...listed, verdict: "great" as "no" }])))).toMatchObject({ status: "invalid", code: "project.invalid_choice" });
    expect(parse(builderReturn((value) => (value.trials = [{ ...listed, rows: -1 }])))).toMatchObject({ status: "invalid", code: "project.invalid_count" });
    expect(parse(builderReturn((value) => (value.trials = [{ ...listed, said: "x" } as typeof listed])))).toMatchObject({ status: "invalid", code: "project.unknown_field" });
  });

  it("refuses a return that does not answer its brief", () => {
    const codes = (change: (value: ReturnType<typeof builderReturn>) => void, owner = brief()) => issues(builderReturn(change), owner).map((issue) => issue.code);
    expect(codes((value) => (value.briefId = "b2"))).toEqual(["project.return_brief_mismatch"]);
    expect(codes((value) => (value.proposal!.subflowKey = "list_soups"))).toEqual(["project.return_subflow_mismatch"]);
    expect(codes((value) => delete value.proposal)).toEqual(["project.return_done_without_proposal"]);
    expect(codes((value) => (value.findings = ["the cookbook needs a sign-in"]))).toEqual(["project.return_findings_not_survey"]);
    const survey = brief((value) => Object.assign(value, { kind: "survey" }));
    expect(codes((value) => delete value.proposal, survey)).toEqual(["project.return_done_without_findings"]);
    expect(codes(() => undefined, survey)).toContain("project.return_survey_proposal");
  });

  it("accepts a partial or blocked return without a proposal", () => {
    expect(issues(builderReturn((value) => Object.assign(value, { outcome: "blocked", proposal: undefined })), brief())).toEqual([]);
  });

  // t676: a blocked return carries the part a subflow before it already does, as Core checked the builder's claim.
  it("reads a blocked return's done-before part and act, refuses either malformed, and binds it to a blocked return of the brief's own part", () => {
    const blocked = (doneBefore: unknown) => builderReturn((value) => Object.assign(value, { outcome: "blocked", proposal: undefined, doneBefore }));
    expect(parse(blocked({ part: "p2", act: "act-3" }))).toMatchObject({ status: "valid", value: { doneBefore: { part: "p2", act: "act-3" } } });
    expect(parse(blocked({ part: "p2" }))).toEqual({ status: "valid", value: blocked({ part: "p2" }) });
    expect(parse(blocked({ part: " p2" }))).toMatchObject({ status: "invalid", code: "project.invalid_id" });
    expect(parse(blocked({ part: "p2", said: "x" }))).toMatchObject({ status: "invalid", code: "project.unknown_field" });
    expect(parse(blocked({ act: "act-3" }))).toMatchObject({ status: "invalid" });
    expect(issues(blocked({ part: "p2", act: "act-3" }), brief())).toEqual([]);
    expect(issues(blocked({ part: "p9" }), brief()).map((issue) => issue.code)).toEqual(["project.return_done_before"]);
    const partial = builderReturn((value) => Object.assign(value, { outcome: "partial", doneBefore: { part: "p2" } }));
    expect(issues(partial, brief()).map((issue) => issue.code)).toEqual(["project.return_done_before"]);
  });

  // t743: a return that is not done may carry a closed terminal reason, read from Core's own signals where it is made.
  it("reads each closed terminal reason on a return that is not done, refuses any other, and refuses one on a done return", () => {
    const blocked = (terminalReason: unknown) => builderReturn((value) => Object.assign(value, { outcome: "blocked", proposal: undefined, terminalReason }));
    for (const reason of ["allowance_spent", "stopped", "person_ended", "gate_unsatisfiable"]) {
      expect(parse(blocked(reason))).toEqual({ status: "valid", value: blocked(reason) });
      expect(issues(blocked(reason), brief())).toEqual([]);
    }
    expect(parse(blocked("tired"))).toMatchObject({ status: "invalid", code: "project.invalid_choice" });
    const done = builderReturn((value) => Object.assign(value, { terminalReason: "stopped" }));
    expect(issues(done, brief()).map((issue) => issue.code)).toEqual(["project.return_terminal_reason"]);
  });

  it("accepts a done reset without a proposal and refuses one that proposes a subflow", () => {
    const reset = brief((value) => Object.assign(value, { kind: "reset", parts: [], permittedActs: [] }));
    expect(issues(builderReturn((value) => delete value.proposal), reset)).toEqual([]);
    expect(issues(builderReturn(), reset).map((issue) => issue.code)).toEqual(["project.return_reset_proposal"]);
  });
});
