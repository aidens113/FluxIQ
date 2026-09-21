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

  it("says a run with no record set had no result, and nothing more", () => {
    expect(automationStudioResultVerificationStatus(skipped(AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noResult))).toBe("no_result");
  });

  it("treats any other reason for not judging as unverified", () => {
    expect(automationStudioResultVerificationStatus(skipped("core.result.some_future_reason"))).toBe("unverified");
  });
});
