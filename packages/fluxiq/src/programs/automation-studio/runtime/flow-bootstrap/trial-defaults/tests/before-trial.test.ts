// P4: a trial's `cannotUndo` is defaulted from the acts the reset listed (report row 9). Omitted, the reset is asked with
// the acts it closed as unsettleable, never one still listed to undo; supplied, the list is only narrowed to acts it
// listed. Both trial gates ask through it.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../candidate/index.ts";

const candidate = { revision: 5, digest: "a1b2c3d4" } as unknown as AutomationStudioFlowCandidate;
const receipt: JsonObject = { revision: 5, digest: "a1b2c3d4" };

/** A reset that lists two acts of a library's loan desk, one in place and one closed as unsettleable, and notes what `cannotUndo` each trial asked it with. */
function listing() {
  const asked: Array<readonly string[] | undefined> = [];
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: async (_signal, cannotUndo) => {
      asked.push(cannotUndo);
      return { kind: "admit", startedWith: { acts: [{ act: "act-1", did: "press \"Renew\" button" }, { act: "act-2", did: "press \"Hold\" button", reason: "gate_unsatisfiable", failed: "no_admissible_undo" }], instruction: "x" } };
    },
    trialRan: () => []
  };
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, reset,
    trial: { candidateId: "candidate.library", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "unsure", trialRunId: "trial.1", feedback: {} }) } });
  return { gate, asked };
}

describe("a trial's cannotUndo", () => {
  it("is defaulted to the acts the reset closed as unsettleable when the call omits it, never to one still to undo", async () => {
    const { gate, asked } = listing();
    await gate.test(receipt);
    await gate.test(receipt);
    expect(asked).toEqual([undefined, ["act-2"]]);
  });

  it("is only narrowed when the call supplies it: an id the reset never listed does not count", async () => {
    const { gate, asked } = listing();
    await gate.test(receipt);
    await gate.test({ ...receipt, cannotUndo: ["act-2", "act-9"] });
    await gate.test({ ...receipt, cannotUndo: [] });
    expect(asked).toEqual([undefined, ["act-2"], []]);
    // An act still listed to undo may be named: the model knows the site offers no control for it.
    const again = listing();
    await again.gate.test(receipt);
    await again.gate.test({ ...receipt, cannotUndo: ["act-1"] });
    expect(again.asked).toEqual([undefined, ["act-1"]]);
  });

  it("is described as optional and defaulted", () => {
    expect(JSON.stringify(listing().gate.tool.inputSchema)).toContain("Optional; leave it out. Core defaults it");
  });
});
