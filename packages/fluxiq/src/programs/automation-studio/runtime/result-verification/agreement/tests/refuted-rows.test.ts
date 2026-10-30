// What a double no whose every defect row Core's record of that row refutes
// comes to after its one re-ask (t810, `../unsupported-no.ts`, `byRowRecord`),
// driven with a stub `ask` so a re-ask's answer can be any verification: a yes
// citing a cell Core refutes is unsure (`yesCitationRefuted`), whether the
// verdict reader already held it or it still reads yes. On the made-up
// reading-circle board of `../../located-defects/tests/circle-board-fixture.ts`.
// No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerification } from "../../contracts/index.ts";
import { CIRCLE_REQUEST, CIRCLE_YES, REFUTED_NO, circleInstruction, circleRunSummary } from "../../located-defects/tests/circle-board-fixture.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationNoRecord, automationStudioResultVerificationReaskUnsupportedNo } from "../index.ts";

const summary = circleRunSummary();
const wording = automationStudioRequestWording([circleInstruction()], summary);
const read = (diagnosis: Record<string, unknown>): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: diagnosis as never, basis: "model", wording });

/** The double no, its record, and the stage that asks each no once more with `answers`, in order. */
async function reasked(...answers: AutomationStudioResultVerification[]) {
  const first = read(REFUTED_NO);
  const second = read(REFUTED_NO);
  const input = { first, second, reads: summary.reads, recordSets: summary.recordSets, wording, summary, requestText: CIRCLE_REQUEST };
  const settled = automationStudioResultVerificationAgreement(input);
  const rechecks: string[] = [];
  const outcome = await automationStudioResultVerificationReaskUnsupportedNo({
    settled, calls: [first, second], record: automationStudioResultVerificationNoRecord(input), summary, requestText: CIRCLE_REQUEST,
    ask: async (recheck) => {
      rechecks.push(recheck);
      const answer = answers[rechecks.length - 1];
      if (!answer) throw new Error("no answer scripted");
      return answer;
    },
    agree: (one, two) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two })
  });
  return { settled, outcome, rechecks };
}

describe("a double no Core's record of its rows wholly refutes, after its re-ask (t810)", () => {
  it("starts as a double no: neither no names a defect Core finds", async () => {
    const { settled } = await reasked(read(REFUTED_NO), read(REFUTED_NO));
    expect(settled.verdict).toBe("does_not_answer");
  });

  it("is unsure where a re-ask's yes still carries a citation Core refutes", async () => {
    const citedWrongly: AutomationStudioResultVerification = { ...read(CIRCLE_YES), yesCitations: { cited: 1, refuted: ["The cited row \"Poetry Circle\" does not hold the value cited."] } };
    const { outcome } = await reasked(citedWrongly, read(REFUTED_NO));
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted, calls: 4 });
    expect(outcome.yesCitations?.refuted).toHaveLength(1);
    expect(outcome.refutedRows?.length).toBeGreaterThan(0);
    expect(outcome.repair).toBeUndefined();
  });

  it("is unsure where the verdict reader already held that yes as citing a refuted cell", async () => {
    const held: AutomationStudioResultVerification = { ...read(CIRCLE_YES), verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted, yesCitations: { cited: 2, refuted: ["one"] } };
    const { outcome } = await reasked(read(REFUTED_NO), held);
    expect(outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted });
  });

  it("answers with a re-ask yes whose citations Core finds every one of", async () => {
    const cited: AutomationStudioResultVerification = { ...read(CIRCLE_YES), yesCitations: { cited: 2, refuted: [] } };
    const { outcome, rechecks } = await reasked(cited, read(REFUTED_NO));
    expect(rechecks).toHaveLength(2);
    expect(outcome).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers, calls: 4 });
    expect(outcome.yesCitations).toEqual({ cited: 2, refuted: [] });
  });
});
