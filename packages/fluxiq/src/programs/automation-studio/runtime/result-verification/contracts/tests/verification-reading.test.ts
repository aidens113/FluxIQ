import { expect, it } from "vitest";
import {
  resultVerificationAnswers,
  resultVerificationFailsRun
} from "../../../../../../flows/executable/verification/outcome/index.ts";
import {
  automationStudioResultVerificationAnswers,
  automationStudioResultVerificationFailsRun
} from "../index.ts";

it("retains the exact public verification-reader identities at the old facade", () => {
  expect(automationStudioResultVerificationAnswers).toBe(resultVerificationAnswers);
  expect(automationStudioResultVerificationFailsRun).toBe(resultVerificationFailsRun);
});
