// An unsure trial of a whole candidate says that testing the same revision
// again is allowed, and when it is the better move, while retests are left
// (t632); with none left, it says to change the Flow for a defect the trial
// shows. A8 wave 8 `run-mv9gbsm5-2957581c` (0051-0054).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION, AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../index.ts";

const candidate = { revision: 4, digest: "f".repeat(64) } as AutomationStudioFlowCandidate;
const receipt: JsonObject = { revision: candidate.revision, digest: candidate.digest };

describe("an unsure whole-candidate trial", () => {
  it("says a re-test is allowed and when it is the better move, until retests run out", async () => {
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.unsure", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed" } }) } });
    for (let trial = 1; trial < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION; trial += 1) {
      const ran = await gate.test(receipt);
      const told = String((ran.evidence as JsonObject).instruction);
      expect(ran.resultReason).toBe("retry_allowed");
      expect(told).toContain("Testing this same revision again, with the same revision and digest, is allowed");
      expect(told).toContain("one judge call said yes (answeredReading)");
      expect(told).toContain("would take back what answered an earlier no");
      expect(gate.completion(candidate)).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unsure"], feedback: { instruction: told } });
    }
    const last = await gate.test(receipt);
    const told = String((last.evidence as JsonObject).instruction);
    expect(last.resultReason).toBeUndefined();
    expect(told).toContain("this revision has no retests left");
    expect(told).not.toContain("is allowed");
    expect(told).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge)\b/iu);
    expect(gate.completion(candidate)).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unsure"], feedback: { instruction: told } });
  });
});
