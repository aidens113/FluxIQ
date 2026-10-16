// The step hint (t666, `../../candidate/kept-step-hint.ts`) through a brief's
// scoped submission controller: a proposal whose trial shows a step choosing
// the request's own words, then a proposal without it, is refused once in Core's
// words naming the subflow, the builder is told it is a hint, and the same
// proposal sent again is accepted. The proposal re-keys its target under the
// scope's key, so the step is found in the probe by its own key. The library
// catalogue of `../../candidate/tests/kept-step/tests/kept-step-fixture.ts`; the trial is the
// gate's kept result, stubbed.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE, automationStudioCandidateSubmissionRefusal } from "../../candidate/index.ts";
import { AUDIOBOOK, AUDIOBOOK_REQUEST, KEPT_STEP_SUBMISSION, UNABRIDGED, choiceReadScript as script, choiceTrialFeedback } from "../../candidate/tests/kept-step/tests/kept-step-fixture.ts";
import { AutomationStudioSubflowScopedSubmissionController, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { SIBLINGS, testScope } from "./subflow-fixture.ts";

const scope = testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: AUDIOBOOK_REQUEST }] });

function brief() {
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: KEPT_STEP_SUBMISSION });
  const tried = new Map<string, AutomationStudioSubflowTrialResult>();
  const history = { trialOf: (proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => tried.get(proposal.digest) };
  const test = (proposal: AutomationStudioSubflowProposal) => tried.set(proposal.digest, {
    partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: proposal.revision, digest: proposal.digest, entryPrepared: true,
    verdict: "no", feedback: choiceTrialFeedback(proposal.subflows)
  } as AutomationStudioSubflowTrialResult);
  return { submit: (input: JsonObject) => controller.submit(input, history), test };
}

async function proposed(submitted: ReturnType<ReturnType<typeof brief>["submit"]>): Promise<AutomationStudioSubflowProposal> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.proposal;
}

describe("a brief's step that chose the request's own words, dropped (t666)", () => {
  it("is hinted once, naming the subflow, told as a hint, and accepted when sent again", async () => {
    const { submit, test } = brief();
    const tried = await proposed(submit(script([AUDIOBOOK, UNABRIDGED])));
    expect(tried.subflows.map((subflow) => subflow.key)).toContain(scope.subflowKey);
    test(tried);
    const dropped = await submit(script([UNABRIDGED]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE]);
    const said = String(dropped.check.feedback?.instruction);
    expect(said).toContain("chose \"Audiobook\" in \"Format\", and the request itself says \"Audiobook\".");
    expect(said).toContain("this subflow no longer has it as written");
    expect(said).toContain("submit the whole subflow again");
    const next = String(automationStudioCandidateSubmissionRefusal(dropped).evidence.next);
    expect(next).toContain("This refusal is a hint from Core's record, not a block");
    expect(next).not.toContain("Correct every listed issue");
    expect(next).not.toContain("a third decision in a row ends this build");
    const again = await proposed(submit(script([UNABRIDGED])));
    expect(again.revision).toBeGreaterThan(tried.revision);
  });
});
