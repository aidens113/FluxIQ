// A first submission whose `where` tests numbers by their characters is refused once and accepted when sent
// again; the listed-values note names a separating field from the trial's sample rows (t800, P7). Through the
// whole-candidate controller on the library catalogue of `./kept-step-fixture.ts`; no scenario's task or answer.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import {
  AutomationStudioFlowCandidateSubmissionController,
  automationStudioCandidateSubmissionRefusal,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_NUMERIC_TEXT_TEST_CODE } from "../../../../numeric-text/index.ts";
import { KEPT_STEP_SUBMISSION, choiceReadScript as script } from "./kept-step-fixture.ts";

const NUMERIC_WHERE = [{ field: "copies", matches: "^(4|5|6|7)$" }];
const REQUEST = "List every book with at least four copies, with title and narrator.";

function build(instructionText = `Goal\n${REQUEST}`) {
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...KEPT_STEP_SUBMISSION, instructionText });
  const tried = new Map<string, AutomationStudioCandidateTrialResult>();
  const history = { trialOf: (candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">) => tried.get(candidate.digest) };
  return { tried, submit: async (input: JsonObject) => controller.submit(input, history) };
}

describe("a text test of numbers by their characters (t800)", () => {
  it("is refused once, in Core's words, and accepted when sent again", async () => {
    const { submit } = build();
    const first = await submit(script([], NUMERIC_WHERE));
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_NUMERIC_TEXT_TEST_CODE]);
    expect(first.check.feedback).toMatchObject({ code: AUTOMATION_STUDIO_CANDIDATE_NUMERIC_TEXT_TEST_CODE, resend: "accepted_once" });
    const told = automationStudioCandidateSubmissionRefusal(first);
    expect(told.resultCode).toMatch(/^candidate\.numeric_text_test/u);
    expect(String(told.evidence.next)).toContain("send the same change again and it is accepted");
    expect(String(told.evidence.next)).toContain("the text really is words");
    const again = await submit(script([], NUMERIC_WHERE));
    expect(again.ok, JSON.stringify(again)).toBe(true);
  });

  it("never refuses a test of words", async () => {
    const { submit } = build();
    const accepted = await submit(script([], [{ field: "format", contains: "Audiobook" }]));
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true);
  });
});

describe("the trial's sample rows, beside its feedback (t800)", () => {
  const WHERE = [{ field: "format", equals: ["Audiobook", "Large print"] }];
  const SAMPLE = [
    { format: "Audiobook", narrator: "yes" },
    { format: "Large print", narrator: "yes" },
    { format: "Paperback", narrator: "(no value)" }
  ];

  it("names the separating field in the listed-values advice, quoting no row value", async () => {
    const { tried, submit } = build("Goal\nList the books I look after, with title and narrator.");
    const first = await submit(script([], WHERE));
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    const [plain] = first.advice ?? [];
    expect(plain).toBeDefined();
    tried.set(first.candidate.digest, { revision: first.candidate.revision, digest: first.candidate.digest, verdict: "no", feedback: {}, sampleRows: [SAMPLE] });
    const second = await submit(script([], [...WHERE, { field: "title", is: "present" }]));
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    const named = (second.advice ?? []).find((note) => note.includes("\"narrator\""));
    expect(named).toBeDefined();
    expect(named).not.toContain("(no value)");
  });
});
