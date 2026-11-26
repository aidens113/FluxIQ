// The whole gate holds a yes over a read Core flagged unless the judge's converse call confirmed it (t692, t1056,
// `../rows.ts`). Before t1056 the whole gate kept such a yes as a yes and let it complete, so a single-subflow build
// whose builder had held it unsure could still end with it as its candidate. A shop's returns desk, no realistic Lab
// scenario's site.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../index.ts";

const LATEST = { revision: 1, digest: "d".repeat(64) } as AutomationStudioFlowCandidate;
const FLAGGED_READ = { nodeId: "node.list-returns", seen: 7, kept: 7, keptEveryRow: { narrowerRead: "node.read-pending", said: "This read kept every row it saw after an act ran over a narrower read." } };

function gate(feedback: JsonObject) {
  return new AutomationStudioFlowCandidateTrialGate({
    latest: () => LATEST,
    trial: { candidateId: "candidate.1", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "yes", feedback: structuredClone(feedback), trialRunId: "run-1" }) }
  });
}

describe("a whole trial's yes over a read Core flagged", () => {
  it("is kept unsure, never completes, and may be tested again, where the converse call did not confirm it", async () => {
    const held = gate({ reads: [FLAGGED_READ], firstAskConfirmed: false });
    const answer = await held.test({ revision: 1, digest: LATEST.digest });
    expect(answer.evidence).toMatchObject({ ok: false, verdict: "unsure", feedback: { code: "candidate.trial_rows_unaccounted", keptEveryRow: [{ read: "node.list-returns" }] } });
    expect(String((answer.evidence as JsonObject).instruction)).toContain("Read keptEveryRow");
    expect((answer.evidence as JsonObject).retestsLeft).toBeGreaterThan(0);
    expect(held.standing(LATEST)?.verdict).toBe("unsure");
    expect(held.completion({ revision: 1, digest: LATEST.digest })).toMatchObject({ ok: false });
  });

  it("stands as a yes where the converse call confirmed it, or where no read was flagged", async () => {
    for (const feedback of [{ reads: [FLAGGED_READ], firstAskConfirmed: true }, { reads: [{ nodeId: "node.list-returns", seen: 3, kept: 3 }] }]) {
      const standing = gate(feedback);
      await standing.test({ revision: 1, digest: LATEST.digest });
      expect(standing.standing(LATEST)?.verdict).toBe("yes");
      expect(standing.completion({ revision: 1, digest: LATEST.digest })).toEqual({ ok: true });
    }
  });
});
