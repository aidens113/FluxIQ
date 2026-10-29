import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../candidate/index.ts";
import { AutomationStudioSiteResetProjectLedger, automationStudioSiteResetProjectReset, type AutomationStudioSiteResetDecision, type AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };

function answer(request: AutomationStudioSubflowTrialRequest, overrides: Partial<AutomationStudioSubflowTrialResult> = {}): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: { said: "ok" }, entryPrepared: true, ...overrides };
}

function gateWith(port?: (request: AutomationStudioSubflowTrialRequest) => Promise<AutomationStudioSubflowTrialResult>) {
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port });
}

const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

describe("the subflow trial gate", () => {
  it("asks the port with the scope and the exact latest proposal, and keeps its partial verdict", async () => {
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const gate = gateWith(async (request) => {
      asked.push(request);
      return answer(request);
    });
    expect(gate.tool.toolId).toBe(AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID);
    const ran = await gate.test(receipt);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.scope).toEqual(scope);
    expect(asked[0]!.proposal).toEqual(proposal);
    expect(Object.isFrozen(asked[0]!.proposal)).toBe(true);
    expect(ran.evidence).toMatchObject({ ok: true, partial: true, verdict: "yes", subflowKey: "find_listing", promotionCredit: false, entryPrepared: true });
    expect(gate.standing(proposal)).toMatchObject({ partial: true, scope: "subflow", verdict: "yes" });
    expect(gate.completion(proposal)).toEqual({ ok: true });
  });

  it("is no trial for the whole-candidate gate: a partial yes fed to its completion still answers candidate.trial_required", async () => {
    const gate = gateWith(async (request) => answer(request));
    await gate.test(receipt);
    const yes = gate.standing(proposal)!;
    expect(yes.verdict).toBe("yes");
    const candidate = { revision: yes.revision, digest: yes.digest } as AutomationStudioFlowCandidate;
    const whole = new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.whole", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} }) } });
    const completion = whole.completion({ revision: yes.revision, digest: yes.digest });
    expect(completion).toMatchObject({ ok: false, issueCodes: ["candidate.trial_required"] });
  });

  it("refuses completion before a trial, after a no, and closes a proposal judged no", async () => {
    const gate = gateWith(async (request) => answer(request, { verdict: "no", feedback: { said: "wrong rows" } }));
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
    await gate.test(receipt);
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unchanged_after_no"] });
    expect(gate.refuted(proposal.digest)).toEqual({ said: "wrong rows" });
    expect((await gate.test(receipt)).resultCode).toBe("subflow.trial_unchanged_after_no");
  });

  it("answers a verdict about another brief, or another revision, as execution_failed", async () => {
    const otherBrief = gateWith(async (request) => answer(request, { identity: { ...identity, briefId: "brief-2" } }));
    expect((await otherBrief.test(receipt)).evidence).toMatchObject({ verdict: "execution_failed", feedback: { code: "subflow.trial_result_mismatch" } });
    const notPartial = gateWith(async (request) => ({ ...answer(request), partial: false }) as unknown as AutomationStudioSubflowTrialResult);
    expect((await notPartial.test(receipt)).evidence).toMatchObject({ verdict: "execution_failed", feedback: { code: "subflow.trial_result_invalid" } });
  });

  it("keeps a yes from an unprepared entry from completing, and lets it be tried again", async () => {
    const gate = gateWith(async (request) => answer(request, { entryPrepared: false }));
    const ran = await gate.test(receipt);
    expect(ran.resultReason).toBe("retry_allowed");
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_yes"] });
  });

  describe("the site put back first, as the whole gate puts it back (t578)", () => {
    type Reset = NonNullable<ConstructorParameters<typeof AutomationStudioSubflowTrialGate>[0]["reset"]>;
    function preparing(order: string[], prepared: "reset" | "failed" | "none" = "reset") {
      const asked: AutomationStudioSubflowTrialRequest[] = [];
      const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
        order.push("trial");
        asked.push(request);
        return answer(request, { acts: [{ step: 2, definitionId: "custom.press", consequences: ["create_new"] }], trialRunId: "trial.1" });
      };
      port.prepareStart = async (input) => {
        order.push(`hook ${input.scope.briefId} ${input.revision}`);
        return prepared;
      };
      return { port, asked };
    }

    it("runs the start hook, then the reset told the site was put back, then the trial; answers what the hook took back and what the trial left", async () => {
      const order: string[] = [];
      const { port, asked } = preparing(order);
      const told: unknown[] = [];
      const reset: Reset = {
        beforeTrial: async (_signal, _cannotUndo, options) => {
          order.push("reset");
          told.push(options);
          return { kind: "admit", absorbedByStartReset: [{ act: "act-1", did: "press \"Add\" button", call: "call.4" }] };
        },
        trialRan: (acts, trialRunId) => {
          order.push(`trialRan ${acts.length} ${trialRunId}`);
          return [{ act: "act-2", did: "trial step 2 custom.press" }];
        }
      };
      const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset });
      const ran = await gate.test(receipt);
      expect(order).toEqual([`hook ${scope.briefId} 2`, "reset", "trial", "trialRan 1 trial.1"]);
      expect(told).toMatchObject([{ startReset: true, change: { steps: expect.any(Array), parts: [{ id: "p1" }] } }]);
      expect(asked[0]!.startedWith).toBeUndefined();
      expect(ran.evidence).toMatchObject({ verdict: "yes", absorbedByStartReset: [{ act: "act-1", did: "press \"Add\" button", call: "call.4" }], leftOnSite: [{ act: "act-2", did: "trial step 2 custom.press" }] });
    });

    it("runs a step with no witness through the build's reset, its answer and its judge's packet saying the gap (t791 fix 4)", async () => {
      // A forum brief: follow the author, a reversible press no place was named for.
      const followScope = testScope({ predecessors: [], parts: [{ partId: "p1", sourceId: "instruction.1", text: "Follow the author", effect: { kind: "end_state", state: "following the author" } }] });
      const following = { ...proposal, subflows: [{ key: followScope.subflowKey, nodes: [{ key: "n1", definitionId: "forum.follow", definitionVersion: "1", label: "follow the author", consequences: ["modify_existing"] }] }] } as unknown as AutomationStudioSubflowProposal;
      const read: { siteChange?: unknown } = {};
      const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
        read.siteChange = (await request.siteChange?.([{ step: 1, definitionId: "forum.follow", outcome: "changed" }]))?.siteChange;
        return answer(request);
      };
      const project = new AutomationStudioSiteResetProjectLedger();
      const reset = automationStudioSiteResetProjectReset({ project, own: project.forBrief(followScope.briefId), checks: () => ({ compare: async () => ({ moved: false }) }) });
      const gate = new AutomationStudioSubflowTrialGate({ scope: followScope, latest: () => structuredClone(following), port, reset });
      const ran = await gate.test(receipt);
      expect(ran.resultCode).toBe("subflow.trial_yes");
      expect(ran.evidence).toMatchObject({ ok: true, verdict: "yes", unwitnessed: { steps: [{ step: 1, label: "follow the author" }] } });
      expect(read.siteChange).toMatchObject({ witnesses: [], proofs: [{ part: "p1", proof: "unproven", steps: [1] }], unwitnessed: { steps: [{ label: "follow the author", ranAs: [1] }], parts: ["p1"] } });
    });

    it("runs no trial while the reset refuses: the model is told what to undo, the refusal counts no trial and may be met by testing again", async () => {
      const order: string[] = [];
      const { port, asked } = preparing(order, "none");
      let refusals = 0;
      const reset: Reset = {
        beforeTrial: async (_signal, cannotUndo) => {
          order.push(`reset ${JSON.stringify(cannotUndo ?? [])}`);
          if (refusals++ === 0) return { kind: "refuse", moved: true, evidence: { ok: false, code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1", did: "press \"Add\" button" }] } };
          return { kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: "press \"Add\" button" }] } };
        },
        trialRan: () => []
      };
      const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset });
      const refused = await gate.test(receipt);
      expect(refused).toMatchObject({ resultCode: "candidate.trial_reset_required", resultReason: "retry_allowed", effectApplied: true, targetsUnchanged: false, evidence: { actsToUndo: [{ act: "act-1" }] } });
      expect(order).toEqual([`hook ${scope.briefId} 2`, "reset []"]);
      expect(gate.standing(proposal)).toBeUndefined();
      const ran = await gate.test({ ...receipt, cannotUndo: ["act-1"] });
      expect(order.slice(2)).toEqual([`hook ${scope.briefId} 2`, "reset [\"act-1\"]", "trial"]);
      // What the trial started with is said to the model and handed to the trial, for its judge.
      expect(ran.evidence).toMatchObject({ verdict: "yes", startedWith: { cannotUndo: [{ act: "act-1" }] } });
      expect(asked[0]!.startedWith).toEqual(["already done by this build (act-1): press \"Add\" button"]);
      expect(gate.completion(proposal)).toEqual({ ok: true });
    });

    it("refuses a malformed cannotUndo, and without a reset never runs the hook ahead of the trial", async () => {
      const order: string[] = [];
      const { port } = preparing(order);
      const plain = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port });
      expect((await plain.test({ ...receipt, cannotUndo: "act-1" })).resultCode).toBe("subflow.trial_input_invalid");
      await plain.test(receipt);
      expect(order).toEqual(["trial"]);
    });
  });

  it("tests only the latest proposal, and says when no runner is here", async () => {
    expect((await gateWith(async (request) => answer(request)).test({ revision: 1, digest: proposal.digest })).resultCode).toBe("subflow.trial_stale_revision");
    const none = gateWith();
    expect((await none.test(receipt)).resultCode).toBe("subflow.trial_unavailable");
    expect(none.completion(proposal)).toEqual({ ok: true });
  });
  // A8 launch 8 (t601): every judge answered yes, Core held the yes for its exclusion evidence, and "change and resubmit it if the feedback
  // names a cause" had the builder rewrite a correct subflow seven times. The hold is read from the feedback's field, never its words (t611).
  it("says a not_judged its judges answered yes to as a yes Core could not confirm, and asks for no rewrite", async () => {
    const why = "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.";
    const gate = gateWith(async (request) => answer(request, { verdict: "not_judged", feedback: { code: "candidate.trial_not_judged", why, yesUnconfirmed: true } }));
    const ran = await gate.test(receipt);
    const told = (ran.evidence as JsonObject).instruction as string;
    expect(told).toContain("The judges answered yes for this revision and none answered no, but Core could not confirm that yes");
    expect(told).toContain("do not rewrite it or change which rows it keeps");
    expect(told).not.toContain("change and resubmit");
    expect(ran.resultReason).toBe("retry_allowed");
    // The completion's refusal says the same.
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_not_judged"], feedback: { instruction: told } });
    // The field alone carries it, whatever the reason's words.
    const reworded = gateWith(async (request) => answer(request, { verdict: "not_judged", feedback: { code: "candidate.trial_not_judged", why: "Held.", yesUnconfirmed: true } }));
    expect(((await reworded.test(receipt)).evidence as JsonObject).instruction).toBe(told);
  });

  it("says a not_judged whose reason names exclusion evidence without the field as any other not_judged (t611)", async () => {
    const plain = "The trial was not judged, so this revision cannot complete. Test it again, or change and resubmit it if the feedback names a cause in the subflow.";
    // Both of Core's held-yes reasons, word for word, and a deadline's: none carries yesUnconfirmed, so none is said as a yes.
    const reasons = [
      "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.",
      "The affirmative judgement did not supply the required row-local exclusion evidence, so the result remains unconfirmed.",
      "The judge did not answer inside its deadline, so the test was not judged."
    ];
    for (const why of reasons) {
      const gate = gateWith(async (request) => answer(request, { verdict: "not_judged", feedback: { code: "candidate.trial_not_judged", why } }));
      expect(((await gate.test(receipt)).evidence as JsonObject).instruction).toBe(plain);
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_not_judged"], feedback: { instruction: plain } });
    }
    // A field on any other verdict changes nothing.
    const unsure = gateWith(async (request) => answer(request, { verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed", yesUnconfirmed: true } }));
    // An unsure is said as an unsure (its re-test allowed, t632, t641), never as a yes Core held.
    const toldUnsure = String(((await unsure.test(receipt)).evidence as JsonObject).instruction);
    expect(toldUnsure).toMatch(/^The judge could not confirm this subflow did what its parts ask, so this revision cannot complete yet\. /u);
    expect(toldUnsure).toContain("Testing this same revision again, with the same revision and digest, stays allowed");
    expect(toldUnsure).not.toContain("The judges answered yes");
  });
});

// L1 reset settlement: a builder's trial act reaches its ledger whole, every
// spot token, the step's controls and its collections, as the port read them.
describe("the subflow trial gate's acts (L1)", () => {
  it("tells the reset's trialRan each act with every spot token, its controls and its collections intact", async () => {
    const act = {
      step: 3,
      definitionId: "domain.demo.move",
      consequences: ["modify_existing" as const],
      spot: { item: "i:row", subject: "s:a", page: "s:page", scope: "c:from", resource: "r:one", place: "p:slot", state: "v:off" },
      controls: { page: "p:page", before: { "v:off": 1 }, after: { "v:on": 1 } },
      collections: {
        before: [{ scope: "c:from", group: "g:list", subjects: ["s:a"], states: { "s:a": "v:in" } }],
        after: [{ scope: "c:to", group: "g:list", subjects: ["s:a"], states: { "s:a": "v:in" } }]
      },
      created: ["i:made"]
    };
    const told: unknown[] = [];
    const gate = new AutomationStudioSubflowTrialGate({
      scope,
      latest: () => structuredClone(proposal),
      port: async (request) => answer(request, { verdict: "unsure", acts: [structuredClone(act)], trialRunId: "trial.1" }),
      reset: {
        beforeTrial: async () => ({ kind: "admit" }),
        trialRan: (acts) => {
          told.push(structuredClone(acts));
          return [];
        }
      }
    });
    await gate.test(receipt);
    expect(told).toEqual([[act]]);
  });
});

// The reset as its own step (t737), as at the whole gate: the site check before a core.test_subflow trial is
// written as an `NNNN-reset` step around exactly that check.
describe("the subflow trial gate's reset step", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "fluxiq-subflow-reset-step-"));
    vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  const resetSteps = () => readdirSync(directory).filter((name) => /^\d{4,}-reset$/u.test(name)).map((name) => JSON.parse(readFileSync(path.join(directory, name, "meta.json"), "utf8")) as Record<string, unknown>);

  function gateOf(decision: AutomationStudioSiteResetDecision, options: { offline?: true; noReset?: true } = {}) {
    const at = { checked: 0, ran: 0 };
    const run = async (request: AutomationStudioSubflowTrialRequest) => {
      at.ran = Date.now();
      return answer(request);
    };
    const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(run, { environmentKind: options.offline ? "trace" as const : "live" as const });
    const reset: AutomationStudioSiteResetTrialReset = {
      beforeTrial: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        at.checked = Date.now();
        return decision;
      },
      trialRan: () => []
    };
    return { gate: new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, ...(options.noReset ? {} : { reset }) }), at };
  }

  it("writes one reset step around the site check, before the trial runs", async () => {
    const { gate, at } = gateOf({ kind: "admit" });
    await gate.test(receipt);
    const steps = resetSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: "reset", stage: "site_check", trialToolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, outcome: "admit", status: "ok" });
    expect(Date.parse(String(steps[0]!.startedAt))).toBeLessThanOrEqual(at.checked);
    expect(Date.parse(String(steps[0]!.finishedAt))).toBeGreaterThanOrEqual(at.checked);
    expect(Date.parse(String(steps[0]!.finishedAt))).toBeLessThanOrEqual(at.ran);
  });

  it("writes a refused check as its outcome, and no trial runs", async () => {
    const { gate, at } = gateOf({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" }, moved: false });
    await gate.test(receipt);
    expect(resetSteps()).toMatchObject([{ stage: "site_check", outcome: "refuse" }]);
    expect(at.ran).toBe(0);
  });

  it("writes none when no reset happens: an offline trial, or a gate with no site reset", async () => {
    for (const options of [{ offline: true as const }, { noReset: true as const }]) {
      const { gate, at } = gateOf({ kind: "admit" }, options);
      await gate.test(receipt);
      expect(at.ran).toBeGreaterThan(0);
      expect(resetSteps()).toEqual([]);
    }
  });
});
