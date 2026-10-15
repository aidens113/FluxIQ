// The build-test judge's not_judged after a yes Core held for its exclusion evidence carries the fact (t611), as
// `yesUnconfirmed`, for the trial's feedback and the subflow trial gate to read in place of the reason's words. No model
// is called: the agreement is built from scripted diagnoses and `verify` is injected.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioResultVerificationAgreement } from "../../agreement.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary, requestWordsWording } from "../../request-rows/tests/request-words-fixture.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";
import type { AutomationStudioResultVerificationReport } from "../../verify.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";

const STOCK_SAID = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;

/** A yes over a row a condition alone left out, whose reason is only the words the request searched by: Core holds it. */
const heldYes = (): AutomationStudioResultVerification => automationStudioResultVerdict({
  summary: requestWordsRunSummary(),
  diagnosis: { answersRequest: "yes", observed: `${STOCK_SAID} Replacement Handle for Garden Tools is left out: it is a part, and the request asks for "garden tools".` },
  basis: "model",
  wording: requestWordsWording()
});
/** A yes Core takes: each left-out row beside the request's own excluding words. */
const takenYes = (): AutomationStudioResultVerification => automationStudioResultVerdict({
  summary: requestWordsRunSummary(),
  diagnosis: { answersRequest: "yes", observed: `${STOCK_SAID} Replacement Handle for Garden Tools is left out, as the request says "replacement parts".` },
  basis: "model",
  wording: requestWordsWording(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS)
});
const unsure = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary: requestWordsRunSummary(), diagnosis: { answersRequest: "unknown" }, basis: "model" });

describe("the build-test judge's not_judged after a held yes (t611)", () => {
  const instruction: AutomationStudioFlowInstruction = {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: "Collect every garden tool on the first page.",
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
  const summary: AutomationStudioRunResultSummary = requestWordsRunSummary();
  const judged = (outcome: AutomationStudioResultVerification) => automationStudioBuildTestJudge({
    instructions: [instruction], projectId: "project-1", flowId: "flow-1",
    verify: async (): Promise<AutomationStudioResultVerificationReport> => ({ outcome: { ...outcome, performed: true }, interventions: [] })
  })({ summary });

  it("carries the field where every call answered yes, and the reason as before", async () => {
    const agreed = automationStudioResultVerificationAgreement({ first: heldYes(), second: takenYes(), confirmAnswer: true });
    const verdict = await judged(agreed);
    expect(verdict).toMatchObject({ verdict: "not_judged", why: "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.", yesUnconfirmed: true });
  });

  it("carries none where a call beside the held yes could not tell", async () => {
    const verdict = await judged(automationStudioResultVerificationAgreement({ first: heldYes(), second: unsure(), confirmAnswer: true }));
    expect(verdict).toMatchObject({ verdict: "not_judged", why: "The checks did not provide the required exclusion evidence, so the result remains unconfirmed." });
    expect(verdict).not.toHaveProperty("yesUnconfirmed");
  });
});
