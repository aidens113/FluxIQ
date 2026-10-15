// A subflow builder's refusal of a Flow already judged no names its own loop's
// tools, and the revision still standing when that one may be tested again
// (t632). A8 wave 8 `run-mv9gbsm5-2957581c` (0055, 0124): a builder was told to
// "submit the whole changed Flow with core.submit_candidate", a tool its brief
// does not offer, after it rebuilt a refuted revision while an unsure one stood.
// The re-test it offers is the better move only on Core's findings, never on
// one judge's yes (t641, A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioCandidateUnchangedRefusal, type AutomationStudioCandidateTrialResult } from "../../candidate/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowScopedSubmissionController, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

/** A part the target calls, pressing another control than `part()`'s: a changed subflow. */
function otherPart(): string[] {
  return ["part narrow: narrow the listing", "  step: press the other filter", "    node: web.dom.click", "    selector: .other-filter", "    consequences: none", "end"];
}

function trial(proposal: AutomationStudioSubflowProposal, verdict: AutomationStudioSubflowTrialResult["verdict"]): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: proposal.revision, digest: proposal.digest, verdict, feedback: { code: `candidate.trial_${verdict}` }, entryPrepared: true };
}

/** An unsure trial of the standing revision 4, with this feedback, as the refusal is given it. */
function unsureTrial(feedback: JsonObject): AutomationStudioCandidateTrialResult {
  return { revision: 4, digest: "4".repeat(64), verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed", ...feedback } };
}

/** The refusal of a Flow judged no beside that unsure revision 4. */
function refusedBeside(lastTrial: AutomationStudioCandidateTrialResult) {
  return automationStudioCandidateUnchangedRefusal({ standing: undefined, lastTrial: undefined, refuted: { said: "judged no" }, current: { revision: 4, digest: "4".repeat(64), lastTrial } });
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
    // The unsure revision still stands, and testing it again is said to be allowed; nothing of Core's record makes it the better move (t641).
    expect(instruction).toContain(`Revision ${unsure.revision} still stands and its last trial answered unsure, so testing it again with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}`);
    expect(instruction).toContain("Nothing in Core's record contradicts what kept that trial from a yes (retestAdvised is false)");
    expect(instruction).not.toContain("one judge call said yes");
    expect(again.check.feedback).toMatchObject({ standingRevision: { revision: unsure.revision, verdict: "unsure", retestAdvised: false } });
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

  it("offers a re-test as the better move only where Core's record contradicts the no, the doubt, or the no was not taken (t641)", () => {
    const split = refusedBeside(unsureTrial({ unconfirmedReading: { observed: "Two stored sites show \"Open next weekend\"." }, answeredReading: { observed: "Every stored site is open." } }));
    expect(String(split.feedback.instruction)).toContain("(retestAdvised is false)");
    expect(String(split.feedback.instruction)).not.toMatch(/one judge call said yes|is the better move/u);
    expect(split.feedback.standingRevision).toMatchObject({ revision: 4, retestAdvised: false });
    const contradicted = [
      { unconfirmedReading: { observed: "Judge call 2 (contradicted by Core's record: ...): ...", recordContradicts: "whole" } },
      { doubtContradicted: "Judge call 1 could not tell, saying the list has pages its read never reached; Core's record says otherwise." },
      { contradictedByBuild: "Core's record of this build contradicts this no." }
    ];
    for (const feedback of contradicted) {
      const check = refusedBeside(unsureTrial(feedback));
      expect(String(check.feedback.instruction)).toContain("It is the better move here (retestAdvised is true): Core's record contradicts what kept that trial from a yes");
      expect(check.feedback.standingRevision).toMatchObject({ retestAdvised: true });
      expect(String(check.feedback.instruction)).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
    }
    // In part is no reason to test again unchanged.
    expect(refusedBeside(unsureTrial({ unconfirmedReading: { observed: "...", recordContradicts: "part" } })).feedback.standingRevision).toMatchObject({ retestAdvised: false });
  });

  it("still names the candidate loop's tools where no other loop's are given", () => {
    const check = automationStudioCandidateUnchangedRefusal({ standing: undefined, lastTrial: undefined, refuted: { said: "judged no" } });
    expect(String(check.feedback.instruction)).toContain("submit the whole changed Flow with core.submit_candidate");
  });
});
