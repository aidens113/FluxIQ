import { describe, expect, it } from "vitest";
import type { ResultVerification, ResultVerdict, ResultVerdictBasis } from "../index.ts";
import { resultVerificationAnswers, resultVerificationFailsRun } from "../index.ts";

const verdicts: ResultVerdict[] = ["answers", "does_not_answer", "unsure"];
const bases: ResultVerdictBasis[] = ["core_observation", "model", "model_silent", "model_unavailable", "model_disagreed", "model_unconfirmed"];

describe("the shared verification verdict reading", () => {
  it.each(verdicts.flatMap((verdict) => bases.map((basis) => ({ verdict, basis }))))("reads $verdict on $basis with the existing run-failure rule", ({ verdict, basis }) => {
    const value: ResultVerification = {
      schemaVersion: "automation-studio.result-verification.v1", verdict, basis,
      code: "verification.test", reason: "A frozen test verdict.", observation: "No stored rows."
    };
    const bytes = JSON.stringify(value);
    expect(resultVerificationAnswers(value)).toBe(verdict === "answers");
    expect(resultVerificationFailsRun(value)).toBe(verdict !== "answers" && basis !== "model_disagreed" && basis !== "model_unconfirmed");
    expect(JSON.stringify(value)).toBe(bytes);
  });
});
