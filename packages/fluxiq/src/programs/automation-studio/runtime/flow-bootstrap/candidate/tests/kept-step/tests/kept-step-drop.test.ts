// A submission that no longer has a step choosing the request's own words, and
// tests them nowhere, gets a one-time hint (t666, A8 frozen pair 8 candidate
// towels `run-mvam0lys-2d3eb090`, revision 8), through the whole-candidate
// submission controller and the refusal its loop sends, on the library
// catalogue of `./kept-step-fixture.ts`: no task, site, item or answer of any
// realistic scenario. The trial is the gate's kept result, stubbed.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE,
  AutomationStudioFlowCandidateSubmissionController,
  automationStudioCandidateSubmissionRefusal,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";
import { AUDIOBOOK, AUDIOBOOK_REQUEST, KEPT_STEP_SUBMISSION, UNABRIDGED, choiceReadScript as script, choiceTrialFeedback } from "./kept-step-fixture.ts";

function build() {
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...KEPT_STEP_SUBMISSION, instructionText: `Goal\n${AUDIOBOOK_REQUEST}` });
  const tried = new Map<string, AutomationStudioCandidateTrialResult>();
  const history = { trialOf: (candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">) => tried.get(candidate.digest) };
  const submit = async (input: JsonObject) => controller.submit(input, history);
  const test = (candidate: AutomationStudioFlowCandidate) =>
    tried.set(candidate.digest, { revision: candidate.revision, digest: candidate.digest, verdict: "no", feedback: choiceTrialFeedback(candidate.buildPlan.plan.subflows) });
  return { controller, submit, test };
}

async function accepted(submitted: ReturnType<ReturnType<typeof build>["submit"]>): Promise<AutomationStudioFlowCandidate> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.candidate;
}

describe("a step that chose the request's own words, dropped (t666)", () => {
  it("is hinted once, in Core's words naming the step, the option and the request's words, and accepted when sent again", async () => {
    const { controller, submit, test } = build();
    const tried = await accepted(submit(script([AUDIOBOOK, UNABRIDGED])));
    test(tried);
    const dropped = await submit(script([UNABRIDGED]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE]);
    const said = String(dropped.check.feedback?.instruction);
    expect(said).toContain("Step \"choose Audiobook\"");
    expect(said).toContain("chose \"Audiobook\" in \"Format\", and the request itself says \"Audiobook\".");
    expect(said).toContain("submit the same change again: Core refuses this once, not twice");
    expect(said).not.toContain("Unabridged");
    expect(dropped.check.feedback).toMatchObject({ code: AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE, resend: "accepted_once", standingRevision: { revision: tried.revision }, keptSteps: [{ group: "Format", chose: "Audiobook", requestWords: ["Audiobook"], revision: tried.revision, written: { choice: AUDIOBOOK } }] });
    // The model's next step is its own: Core's words, the revision that stands, and a hint it may override once.
    const told = automationStudioCandidateSubmissionRefusal(dropped);
    expect(told.resultCode).toMatch(/^candidate\.kept_step_dropped/u);
    const next = String(told.evidence.next);
    expect(next).toContain("chose \"Audiobook\" in \"Format\"");
    expect(next).toContain(`Nothing was made a new revision: revision ${tried.revision}, which stood before this submission, still stands.`);
    expect(next).toContain("This refusal is a hint from Core's record, not a block: if you are sure the Flow does not need that step, or reads those words another way, send the same change again and it is accepted.");
    expect(next).not.toContain("Correct every listed issue");
    expect(next).not.toContain("a third decision in a row ends this build");
    expect(`${said} ${next}`).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
    // The revision that stood still stands.
    expect(controller.matches(tried)).toBe(true);
    // Sent again: the model's considered choice, accepted.
    await accepted(submit(script([UNABRIDGED])));
  });

  it("is not hinted where the step is kept, or a condition tests its words, or the dropped step's option is not the request's", async () => {
    const { submit, test } = build();
    test(await accepted(submit(script([AUDIOBOOK, UNABRIDGED]))));
    // The other step dropped: its option is not the request's words.
    await accepted(submit(script([AUDIOBOOK])));
    const { submit: again, test: tested } = build();
    tested(await accepted(again(script([AUDIOBOOK]))));
    // The step dropped, its words tested in a condition instead.
    await accepted(again(script([], [{ field: "format", contains: "Audiobook" }])));
  });
});
