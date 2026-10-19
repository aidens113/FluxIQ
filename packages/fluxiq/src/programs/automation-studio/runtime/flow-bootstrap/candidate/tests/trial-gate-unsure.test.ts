// An unsure trial of a whole candidate says that testing the same revision
// again is allowed while retests are left (t632), and the better move only
// where Core's record contradicts what kept it from a yes (t641); with none
// left, it says to change the Flow for a defect the trial shows. A8 wave 8
// `run-mv9gbsm5-2957581c` (0051-0054); A8 wave 14 candidate towels
// `run-mv9ul5dy-e9a1b1c1` (0083), where a re-test called the better move
// because one judge said yes spent the build's last trial on a wrong revision.
// Social r4 `run-mvfq957o-40103539` (0083, t725): a split is said as a split,
// never as a re-test "likely to be judged the same way".

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION, AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../index.ts";

const candidate = { revision: 4, digest: "f".repeat(64) } as AutomationStudioFlowCandidate;
const receipt: JsonObject = { revision: candidate.revision, digest: candidate.digest };

function gateAnswering(feedback: JsonObject): AutomationStudioFlowCandidateTrialGate {
  return new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.unsure", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed", ...feedback } }) } });
}

/** Trial 9's shape: one call's yes, the other's right no, and nothing of Core's record against that no. */
const SPLIT: JsonObject = {
  unconfirmedReading: { observed: "Two stored sites show only \"Open next weekend\".", advice: "Keep only sites open this weekend." },
  answeredReading: { observed: "Every stored site is open this weekend." }
};

describe("an unsure whole-candidate trial", () => {
  it("says a re-test stays allowed, but not the better move on one judge's yes, until retests run out", async () => {
    const gate = gateAnswering(SPLIT);
    for (let trial = 1; trial < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION; trial += 1) {
      const ran = await gate.test(receipt);
      const evidence = ran.evidence as JsonObject;
      const told = String(evidence.instruction);
      expect(ran.resultReason).toBe("retry_allowed");
      expect(evidence.retestAdvised).toBe(false);
      expect(told).toContain("Testing this same revision again, with the same revision and digest, stays allowed");
      // A split is said as a split (t725): the two calls disagreed on the same evidence, never "likely to be judged the same way".
      expect(told).toContain("The two judge calls read this same trial and disagreed");
      expect(told).toContain("(answeredReading is what it compared)");
      expect(told).toContain("(unconfirmedReading is what it compared and advised, where it gave any)");
      expect(told).toContain("nothing in Core's record settles which is right (retestAdvised is false)");
      expect(told).toContain("Change the Flow only for a row this trial kept that the instruction does not ask for, a row it asks for that this trial left out, or a wrong column or value, where the no names it");
      expect(told).not.toContain("likely to be judged the same way");
      expect(told).not.toContain("is the better move");
      expect(gate.completion(candidate)).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unsure"], feedback: { instruction: told, retestAdvised: false } });
    }
    const last = await gate.test(receipt);
    const told = String((last.evidence as JsonObject).instruction);
    expect(last.resultReason).toBeUndefined();
    expect(told).toContain("this revision has no retests left");
    expect(told).not.toContain("allowed");
    expect(last.evidence).not.toHaveProperty("retestAdvised");
    expect(told).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge|sponsored)\b/iu);
    expect(gate.completion(candidate)).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unsure"], feedback: { instruction: told } });
  });

  it("says nothing in Core's record contradicts a no that stood beside a call that gave no yes, as before (t641)", async () => {
    const ran = await gateAnswering({ unconfirmedReading: SPLIT.unconfirmedReading! }).test(receipt);
    const told = String((ran.evidence as JsonObject).instruction);
    expect(told).toContain("Nothing in Core's record contradicts what kept this trial from a yes (retestAdvised is false)");
    expect(told).not.toContain("disagreed");
    expect(told).not.toContain("answeredReading");
  });

  it("calls a re-test the better move where Core's record wholly contradicts the no's reading (the t632 case), or the unsure call's doubt", async () => {
    const contradicted: JsonObject = { ...SPLIT, unconfirmedReading: { observed: "Judge call 2 (contradicted by Core's record: ...): ...", recordContradicts: "whole" } };
    for (const feedback of [contradicted, { doubtContradicted: "Judge call 1 could not tell, saying the list has pages its read never reached; Core's record says otherwise." }]) {
      const ran = await gateAnswering(feedback).test(receipt);
      const evidence = ran.evidence as JsonObject;
      expect(evidence.retestAdvised).toBe(true);
      const told = String(evidence.instruction);
      expect(told).toContain("Core's record contradicts what kept this trial from a yes (retestAdvised is true)");
      expect(told).toContain("testing this same revision again, with the same revision and digest, is the better move");
      expect(told).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge|sponsored)\b/iu);
    }
  });

  it("reads the fact, never the label's words: a reading labelled by its own words, or contradicted only in part, advises nothing", async () => {
    const worded = { unconfirmedReading: { observed: "Judge call 2 (contradicted by Core's record: every row is wrong): ..." } };
    const part = { unconfirmedReading: { observed: "...", recordContradicts: "part" } };
    for (const feedback of [worded, part]) expect(((await gateAnswering(feedback).test(receipt)).evidence as JsonObject).retestAdvised).toBe(false);
  });

  it("never says nothing in Core's record contradicts a no it refutes in part (t652, trial 6 of `run-mva6mlo8-f519063c`)", async () => {
    const part: JsonObject = { ...SPLIT, unconfirmedReading: { observed: "Judge call 2 (Core's record contradicts part of this reading: a stored row was called missing): ...", recordContradicts: "part" } };
    const gate = gateAnswering(part);
    const ran = await gate.test(receipt);
    const evidence = ran.evidence as JsonObject;
    const told = String(evidence.instruction);
    expect(evidence.retestAdvised).toBe(false);
    expect(told).not.toContain("Nothing in Core's record contradicts");
    expect(told).toContain("Core's record contradicts part of the no's reading, as its label in unconfirmedReading says (retestAdvised is false): make no change for that part.");
    expect(told).toContain("Change the Flow only for what the rest of it names where the trial's own reads, steps and stored rows show it");
    expect(told).toContain("stays allowed");
    expect(told).not.toContain("is the better move");
    expect(told).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge|sponsored)\b/iu);
    expect(gate.completion(candidate)).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unsure"], feedback: { instruction: told, retestAdvised: false } });
  });
});
