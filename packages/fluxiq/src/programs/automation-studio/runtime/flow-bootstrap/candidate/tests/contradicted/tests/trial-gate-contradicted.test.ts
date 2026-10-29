import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../../site-reset/index.ts";
import { automationStudioTrialChangeActs, automationStudioTrialChangeBegin, automationStudioTrialChangeSteps, type AutomationStudioTrialChangeLedgerPort, type AutomationStudioTrialLatestRead } from "../../../../trial-change/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialPort, type AutomationStudioFlowCandidate } from "../../../index.ts";

// t787 fix 4: a yes the trial's own change contradicts is never a pass. A looped press switches a "keep" toggle on three
// books of a library shelf; the build found every book unkept, and an earlier trial kept the second. A trial that keeps
// the first and third and unkeeps the second has put the second back to how the build found it: its judges' yes is kept
// as a no. The fixtures are a library's, never a realistic scenario's site or task.

const OFF = "st:off", ON = "st:on";
const counts = (state: string) => ({ [state]: 1, "st:other": 1 });
const stamp = { via: "control" as const, ref: "control-1" };
const keepThree = { id: "p1", effect: { kind: "change" as const, direction: "adds" as const, count: 3, what: "kept books" } };

const candidate = { revision: 2, digest: "c".repeat(64), buildPlan: { summary: "Keep three", plan: { subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
  { key: "keep", definitionId: "library.keep", definitionVersion: "1.0.0", consequences: ["modify_existing"], resetWitness: stamp }
], edges: [] }] } } } as unknown as AutomationStudioFlowCandidate;

/** A ledger port over the stamp's place `pl:a`, with the build's start at every book: unkept. */
function ledgerPort(): { port: AutomationStudioTrialChangeLedgerPort; look: (location: string) => Promise<void> } {
  let seq = 1;
  let latest: AutomationStudioTrialLatestRead = { reading: { source: "latest_read", location: "loc:a", controls: { "pl:a": counts(OFF) } }, state: { page: "a" }, fresh: true, seq };
  return {
    port: {
      places: () => [{ kind: "control", place: "pl:a", location: "loc:a" }],
      latest: () => latest, seq: () => seq, leftFromEarlier: () => [], carried: () => false,
      start: () => counts(OFF)
    },
    look: async (location) => {
      seq += 1;
      latest = { reading: { source: "latest_read", location, controls: { "pl:a": counts(ON) } }, state: { page: "a" }, fresh: true, seq };
    }
  };
}

const pass = (step: number, number: number, item: string, from: string, to: string) => ({
  step, definitionId: "library.keep", witness: stamp, pass: { number, of: 3 },
  spot: { place: `pl:${item}` }, controls: { page: `pg:${item}`, location: `loc:${item}`, before: counts(from), after: counts(to) }
});

/** A gate whose reset begins a real change session, and whose trial runs the passes `passes`, reads its change, and is judged yes. */
function gateOver(passes: ReturnType<typeof pass>[]) {
  const ledger = ledgerPort();
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: async () => {
      const change = await automationStudioTrialChangeBegin({ steps: automationStudioTrialChangeSteps(candidate.buildPlan!.plan!.subflows, () => ["p1"]), parts: [keepThree], port: ledger.port, look: ledger.look });
      return { kind: "admit", ...(change ? { change } : {}) };
    },
    trialRan: () => []
  };
  const port: AutomationStudioCandidateTrialPort = async (request) => {
    await request.siteChange?.(automationStudioTrialChangeActs(passes), request.signal);
    return { revision: request.revision, digest: request.digest, verdict: "yes", feedback: { code: "candidate.trial_judged_yes" } };
  };
  return new AutomationStudioFlowCandidateTrialGate({ latest: () => structuredClone(candidate), trial: { candidateId: "candidate.1", port }, reset });
}

const receipt = { revision: candidate.revision, digest: candidate.digest };

describe("a whole-candidate trial whose own change contradicts its yes (t787 fix 4)", () => {
  it("never passes: a pass that put a book back to how the build found it keeps the judges' yes as a no", async () => {
    const gate = gateOver([pass(1, 1, "a", OFF, ON), pass(1, 2, "b", ON, OFF), pass(1, 3, "c", OFF, ON)]);
    const evidence = (await gate.test(receipt)).evidence as JsonObject;
    expect(evidence).toMatchObject({ ok: false, verdict: "no" });
    expect((evidence.feedback as JsonObject).changeContradicted).toMatchObject({
      code: "trial.change_contradicted", parts: ["p1"], places: [{ witness: "w2", where: "loc:b", steps: [1] }],
      said: expect.stringContaining("trial step 1, pass 2 of 3")
    });
    expect(gate.completion(receipt).ok).toBe(false);
    expect(gate.standing(candidate)?.verdict).toBe("no");
  });

  it("passes when every pass moved its book away from how the build found it", async () => {
    const gate = gateOver([pass(1, 1, "a", OFF, ON), pass(1, 2, "b", OFF, ON), pass(1, 3, "c", OFF, ON)]);
    const evidence = (await gate.test(receipt)).evidence as JsonObject;
    expect(evidence).toMatchObject({ ok: true, verdict: "yes" });
    expect(evidence.feedback).not.toHaveProperty("changeContradicted");
    expect(gate.completion(receipt).ok).toBe(true);
  });
});
