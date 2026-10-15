// A subflow builder's refusal of a Flow already judged no names its own loop's
// tools, and the revision still standing when that one may be tested again
// (t632). A8 wave 8 `run-mv9gbsm5-2957581c` (0055, 0124): a builder was told to
// "submit the whole changed Flow with core.submit_candidate", a tool its brief
// does not offer, after it rebuilt a refuted revision while an unsure one stood.

import { describe, expect, it } from "vitest";
import { automationStudioCandidateUnchangedRefusal } from "../../candidate/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowScopedSubmissionController, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

/** A part the target calls, pressing another control than `part()`'s: a changed subflow. */
function otherPart(): string[] {
  return ["part narrow: narrow the listing", "  step: press the other filter", "    node: web.dom.click", "    selector: .other-filter", "    consequences: none", "end"];
}

function trial(proposal: AutomationStudioSubflowProposal, verdict: AutomationStudioSubflowTrialResult["verdict"]): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: proposal.revision, digest: proposal.digest, verdict, feedback: { code: `candidate.trial_${verdict}` }, entryPrepared: true };
}

async function accepted(scoped: AutomationStudioSubflowScopedSubmissionController, lines: readonly string[]): Promise<AutomationStudioSubflowProposal> {
  const answer = await scoped.submit(script(lines));
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  if (!answer.ok) throw new Error("refused");
  return answer.proposal;
}

describe("a subflow builder's refusal of a Flow already judged no", () => {
  it("names core.submit_subflow and core.test_subflow, never the whole candidate's tools, and the unsure revision still standing", async () => {
    const scoped = new AutomationStudioSubflowScopedSubmissionController({ scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission() });
    const judgedNo = await accepted(scoped, [...OPEN, ...callPart(), ...part()]);
    const unsure = await accepted(scoped, [...OPEN, ...callPart(), ...otherPart()]);
    expect(unsure.revision).toBe(judgedNo.revision + 1);
    const history = {
      refuted: (digest: string) => (digest === judgedNo.digest ? { said: "judged no" } : undefined),
      trialOf: (proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => (proposal.digest === unsure.digest ? trial(unsure, "unsure") : proposal.digest === judgedNo.digest ? trial(judgedNo, "no") : undefined)
    };
    const again = await scoped.submit(script([...OPEN, ...callPart(), ...part()]), history);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.check.issueCodes).toEqual(["candidate.unchanged_after_no"]);
    const instruction = String(again.check.feedback.instruction);
    expect(instruction).toContain(`submit the whole changed subflow with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID}`);
    expect(instruction).not.toMatch(/core\.submit_candidate|core\.test_candidate/u);
    // The unsure revision still stands, and testing it again is said to be allowed, and when it is the better move.
    expect(instruction).toContain(`Revision ${unsure.revision} still stands and its last trial answered unsure, so testing it again with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}`);
    expect(instruction).toContain("one judge call said yes");
    expect(again.check.feedback).toMatchObject({ standingRevision: { revision: unsure.revision, verdict: "unsure" } });
    expect(scoped.matches(unsure)).toBe(true);
  });

  it("names no revision to test again when the one standing was judged no or yes", async () => {
    const scoped = new AutomationStudioSubflowScopedSubmissionController({ scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission() });
    const judgedNo = await accepted(scoped, [...OPEN, ...callPart(), ...part()]);
    const passed = await accepted(scoped, [...OPEN, ...callPart(), ...otherPart()]);
    const again = await scoped.submit(script([...OPEN, ...callPart(), ...part()]), {
      refuted: (digest) => (digest === judgedNo.digest ? { said: "judged no" } : undefined),
      trialOf: (proposal) => (proposal.digest === passed.digest ? trial(passed, "yes") : undefined)
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(String(again.check.feedback.instruction)).not.toContain("still stands and its last trial");
    expect(again.check.feedback.standingRevision).toBeUndefined();
  });

  it("still names the candidate loop's tools where no other loop's are given", () => {
    const check = automationStudioCandidateUnchangedRefusal({ standing: undefined, lastTrial: undefined, refuted: { said: "judged no" } });
    expect(String(check.feedback.instruction)).toContain("submit the whole changed Flow with core.submit_candidate");
  });
});
