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

  it("accepts a done reset without a proposal and refuses one that proposes a subflow", () => {
    const reset = brief((value) => Object.assign(value, { kind: "reset", parts: [], permittedActs: [] }));
    expect(issues(builderReturn((value) => delete value.proposal), reset)).toEqual([]);
    expect(issues(builderReturn(), reset).map((issue) => issue.code)).toEqual(["project.return_reset_proposal"]);
  });
});
