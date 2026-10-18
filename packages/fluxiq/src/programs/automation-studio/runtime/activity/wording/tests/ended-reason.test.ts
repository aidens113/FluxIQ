import { describe, expect, it } from "vitest";
import { automationStudioActivityEndedReason } from "../ended-reason.ts";

// Why the supervisor ended a build, as the person reads it (t567 lane 4). A job-board build's chat
// read "the single subflow save halvard jobs was briefed twice and both builders failed with flow
// bootstrap.… (bootstrap.source port cardinality) plus repeat refusals, so no proposal was produced".

describe("a supervisor's reason for ending, as the person reads it", () => {
  it("says nothing of the screenshot's reason, which is all codes and the build's machinery", () => {
    const reason = "The single subflow save_halvard_jobs was briefed twice and both builders failed with flow_bootstrap.evidence_completion_plan_invalid (bootstrap.source_port_cardinality) plus repeat refusals, so no proposal was produced and no Flow could be assembled or tested. No lasting acts were left on the target.";
    expect(automationStudioActivityEndedReason(reason, 240)).toBeUndefined();
  });

  it("keeps the plain sentences and leaves out codes, parenthesised codes and the build's machinery", () => {
    const reason = "The search box never showed any results for the name given (dom.selector_missing); each try ended with web.dom_read failed. The builder was briefed twice. See example.com, e.g. its help page.";
    expect(automationStudioActivityEndedReason(reason, 240)).toBe("The search box never showed any results for the name given. See example.com, e.g. its help page.");
    expect(automationStudioActivityEndedReason("The page asked for a sign-in that only you can give.", 240)).toBe("The page asked for a sign-in that only you can give.");
    expect(automationStudioActivityEndedReason(undefined, 240)).toBeUndefined();
  });
});
