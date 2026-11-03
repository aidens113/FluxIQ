import { describe, expect, it } from "vitest";
import { decideAutomationStudioChangeResume, type AutomationStudioChangeVerdictCheck } from "../index.ts";

// The resume decision on its own, over hand-written checks: it reads the checks
// and nothing else, so no proof outcome can talk it into a `true` the checks do
// not support. Every rule below is a fail-closed one.

function check(
  kind: AutomationStudioChangeVerdictCheck["kind"],
  status: AutomationStudioChangeVerdictCheck["status"],
  code?: string
): AutomationStudioChangeVerdictCheck {
  return { kind, status, nodeId: "node.changed", ...(code ? { code } : {}) };
}

const AT_NEXT = { nodeId: "node.next", route: "success" } as const;
const PROVED = [check("changed_node_succeeded", "passed"), check("expected_state", "passed"), check("continuation", "passed")];

describe("change resume decision", () => {
  it("resumes from a decided, proved continuation", () => {
    expect(decideAutomationStudioChangeResume({ checks: PROVED, resumeFrom: AT_NEXT })).toEqual({ resumable: true });
  });

  it("carries no code while it resumes", () => {
    expect(Object.hasOwn(decideAutomationStudioChangeResume({ checks: PROVED, resumeFrom: AT_NEXT }), "code")).toBe(false);
  });

  it("refuses a trial that judged nothing", () => {
    expect(decideAutomationStudioChangeResume({ checks: [] })).toEqual({ resumable: false, code: "no_checks" });
  });

  it("refuses while any check failed", () => {
    const checks = [...PROVED, check("downstream_assertion", "failed", "downstream_assertion_failed")];
    expect(decideAutomationStudioChangeResume({ checks, resumeFrom: AT_NEXT })).toEqual({ resumable: false, code: "check_failed" });
  });

  // The rule the phase turns on: "could not tell" is not "held". It holds for
  // every kind, including the continuation itself, and it outranks evidence
  // that did pass.
  it.each([
    ["the changed node did not finish", check("changed_node_succeeded", "unknown", "changed_node_incomplete")],
    ["the host could not evaluate a declared state", check("expected_state", "unknown", "expected_state_unevaluated")],
    ["a verification node did not finish", check("downstream_assertion", "unknown", "downstream_assertion_incomplete")],
    ["the run stopped somewhere the trial never reached", check("continuation", "unknown", "continuation_incomplete")]
  ])("refuses while a check is unknown because %s", (_label, unknownCheck) => {
    const checks = [...PROVED, unknownCheck];
    expect(decideAutomationStudioChangeResume({ checks, resumeFrom: AT_NEXT })).toEqual({ resumable: false, code: "check_unknown" });
  });

  it("refuses when nothing proved the change, however cleanly it ran", () => {
    const checks = [check("changed_node_succeeded", "passed"), check("continuation", "passed")];
    expect(decideAutomationStudioChangeResume({ checks, resumeFrom: AT_NEXT })).toEqual({ resumable: false, code: "no_evidence" });
  });

  it("refuses when the only evidence rests on a seam nothing writes yet", () => {
    const checks = [check("changed_node_succeeded", "passed"), check("records", "passed", "records_minimum_undeclared"), check("continuation", "passed")];
    expect(decideAutomationStudioChangeResume({ checks, resumeFrom: AT_NEXT })).toEqual({ resumable: false, code: "check_unknown" });
  });

  it("refuses when it has nowhere to resume from, whatever the checks say", () => {
    expect(decideAutomationStudioChangeResume({ checks: PROVED })).toEqual({ resumable: false, code: "no_resume_point" });
  });

  it("counts neither success nor a continuation as evidence", () => {
    const checks = [check("changed_node_succeeded", "passed"), check("continuation", "passed"), check("expected_route", "not_applicable", "expected_route_repeats_failure")];
    expect(decideAutomationStudioChangeResume({ checks, resumeFrom: AT_NEXT })).toEqual({ resumable: false, code: "no_evidence" });
  });

  it("lets a not_applicable check stand aside rather than block", () => {
    const checks = [...PROVED, check("expected_route", "not_applicable", "expected_route_repeats_failure")];
    expect(decideAutomationStudioChangeResume({ checks, resumeFrom: AT_NEXT })).toEqual({ resumable: true });
  });

  it("resumes from a finished run as readily as from a node", () => {
    expect(decideAutomationStudioChangeResume({ checks: PROVED, resumeFrom: { completed: true } })).toEqual({ resumable: true });
  });
});
