import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { automationStudioTrialChangeActs, automationStudioTrialChangeBegin, automationStudioTrialChangeSteps, type AutomationStudioTrialChangeLedgerPort, type AutomationStudioTrialLatestRead } from "../../../../trial-change/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../../../index.ts";
import { testScope } from "../../subflow-fixture.ts";

// t787 fix 4, as the whole gate holds it (`../../../../candidate/tests/contradicted/tests/trial-gate-contradicted.test.ts`): a subflow trial whose
// own readings show a part asking to add put back to how the build found it is kept as a no, whatever its judges
// answered. A looped press switches a "keep" toggle on three books of a library shelf; never a realistic scenario.

type Reset = NonNullable<ConstructorParameters<typeof AutomationStudioSubflowTrialGate>[0]["reset"]>;

const OFF = "st:off", ON = "st:on";
const counts = (state: string) => ({ [state]: 1, "st:other": 1 });
const stamp = { via: "control" as const, ref: "control-1" };
const scope = testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: "Keep three books", effect: { kind: "change", direction: "adds", count: 3, what: "kept books" } }] });
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "e".repeat(64), subflows: [], summary: "Keep", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

function ledgerPort(): { port: AutomationStudioTrialChangeLedgerPort; look: (location: string) => Promise<void> } {
  let seq = 1;
  let latest: AutomationStudioTrialLatestRead = { reading: { source: "latest_read", location: "loc:a", controls: { "pl:a": counts(OFF) } }, state: { page: "a" }, fresh: true, seq };
  return {
    port: { places: () => [{ kind: "control", place: "pl:a", location: "loc:a" }], latest: () => latest, seq: () => seq, leftFromEarlier: () => [], carried: () => false, start: () => counts(OFF) },
    look: async (location) => {
      seq += 1;
      latest = { reading: { source: "latest_read", location, controls: { "pl:a": counts(ON) } }, state: { page: "a" }, fresh: true, seq };
    }
  };
}

const pass = (number: number, item: string, from: string, to: string) => ({
  step: 1, definitionId: "library.keep", witness: stamp, pass: { number, of: 3 },
  spot: { place: `pl:${item}` }, controls: { page: `pg:${item}`, location: `loc:${item}`, before: counts(from), after: counts(to) }
});

function gateOver(passes: ReturnType<typeof pass>[]) {
  const ledger = ledgerPort();
  const steps = automationStudioTrialChangeSteps([{ key: "keep", nodes: [{ key: "keep", definitionId: "library.keep", definitionVersion: "1.0.0", consequences: ["modify_existing"], resetWitness: stamp }] }], () => ["p1"]);
  const reset: Reset = {
    beforeTrial: async (_signal, _cannotUndo, options) => {
      const change = await automationStudioTrialChangeBegin({ steps, parts: options?.change?.parts ?? [], port: ledger.port, look: ledger.look });
      return { kind: "admit", ...(change ? { change } : {}) };
    },
    trialRan: () => []
  };
  const port = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    await request.siteChange?.(automationStudioTrialChangeActs(passes), request.signal);
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: { said: "ok" }, entryPrepared: true };
  };
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset });
}

describe("a subflow trial whose own change contradicts its yes (t787 fix 4)", () => {
  it("never passes: the judges' yes is kept as a no, with Core's words beside the feedback", async () => {
    const gate = gateOver([pass(1, "a", OFF, ON), pass(2, "b", ON, OFF), pass(3, "c", OFF, ON)]);
    const evidence = (await gate.test(receipt)).evidence as JsonObject;
    expect(evidence).toMatchObject({ ok: false, verdict: "no" });
    expect((evidence.feedback as JsonObject).changeContradicted).toMatchObject({ code: "trial.change_contradicted", parts: ["p1"], places: [{ where: "loc:b" }] });
    expect(gate.completion(proposal).ok).toBe(false);
  });

  it("passes when every pass moved its book away from how the build found it", async () => {
    const gate = gateOver([pass(1, "a", OFF, ON), pass(2, "b", OFF, ON), pass(3, "c", OFF, ON)]);
    expect((await gate.test(receipt)).evidence).toMatchObject({ ok: true, verdict: "yes" });
    expect(gate.completion(proposal)).toEqual({ ok: true });
  });
});
