import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerificationOutcome } from "../contracts.ts";
import { automationStudioResultVerificationStatus } from "../verification-status.ts";
import { AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES } from "../verify.ts";

// One word for where a run's result stands, and the rule that a result nobody
// judged is never `confirmed`.

const judged = (verdict: "answers" | "does_not_answer" | "unsure", basis: "model" | "model_disagreed" | "model_unconfirmed" = "model"): AutomationStudioResultVerificationOutcome => ({
  schemaVersion: "automation-studio.result-verification.v1",
  performed: true,
  verdict,
  basis,
  code: "core.result.x",
  reason: "r",
  observation: "o"
});

const skipped = (code: string): AutomationStudioResultVerificationOutcome => ({
  schemaVersion: "automation-studio.result-verification.v1",
  performed: false,
  code,
  reason: "r"
});

describe("automationStudioResultVerificationStatus", () => {
  it("confirms only a result judged to answer", () => {
    expect(automationStudioResultVerificationStatus(judged("answers"))).toBe("confirmed");
    expect(automationStudioResultVerificationStatus(judged("does_not_answer"))).toBe("refuted");
    expect(automationStudioResultVerificationStatus(judged("unsure"))).toBe("refuted");
  });

  it("calls a result two checks did not settle unverified, never confirmed or refuted", () => {
    // Mutation: read an unsettled verification by its verdict alone. `unsure`
    // then says `refuted` for a result the model judged both ways.
    expect(automationStudioResultVerificationStatus(judged("unsure", "model_disagreed"))).toBe("unverified");
    expect(automationStudioResultVerificationStatus(judged("unsure", "model_unconfirmed"))).toBe("unverified");
  });

  it("calls a result no model judged unverified", () => {
    // Mutation: read a skipped verification as a pass. This then says
    // `confirmed` for a result no model saw.
    expect(automationStudioResultVerificationStatus(skipped(AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noModel))).toBe("unverified");
  });

  it("calls a verification that did not finish unverified, never confirmed", () => {
    // The bound that replaced the empty-result exemption. Mutation: read a
    // verification that ran out of time as a pass, and this says `confirmed`
    // for a result nobody judged.
    expect(automationStudioResultVerificationStatus(skipped(AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.notFinished))).toBe("unverified");
  });

  it("no longer produces no_result, because a run that stored nothing is judged too", () => {
    // `no_result` stays in the vocabulary for rows written before 2026-09-24.
    // Mutation: reintroduce a skip code that maps to it, and a run that stored
    // no record set stops being checked against the request.
    expect(Object.values(AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES).map((code) => automationStudioResultVerificationStatus(skipped(code)))).toEqual(["unverified", "unverified"]);
  });

  it("treats any other reason for not judging as unverified", () => {
    expect(automationStudioResultVerificationStatus(skipped("core.result.some_future_reason"))).toBe("unverified");
  });
});
