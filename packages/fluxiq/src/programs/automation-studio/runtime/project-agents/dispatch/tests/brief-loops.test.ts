// The dispatcher with the real loops behind it: the subflow builder's loop
// (`flow-bootstrap/subflow-candidate/builder-loop.ts`) with the candidate
// refusal tests' stub domain, and a reset brief's evidence loop. The model is
// a script.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetNamedAct } from "../../../flow-bootstrap/site-reset/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialRequest } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioProjectBuilderPorts, AutomationStudioProjectResetPorts } from "../index.ts";
import { gardenBrief, gardenBuild, REF } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };
const submitted = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};

describe("a dispatched brief's loop", () => {
  it("builds a subflow with the real builder loop: done with its proposal, its trial's receipt and its spend in the record", async () => {
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const steps = [
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) }),
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: submitted(evidence) }),
      (evidence: readonly Entry[]) => ({ kind: "complete", result: { subflowKey: "list_seeds", ...submitted(evidence) } })
    ];
    let step = 0;
    const builder = (): AutomationStudioProjectBuilderPorts => ({
      loop: {
        tools: [], maxToolCalls: 6,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
        decide: async ({ evidence }) => steps[step++]!(evidence)
      },
      submission: testSubmission(),
      deniedEvidenceKeys: [],
      trial: async (request) => {
        asked.push(request);
        return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: {}, trialRunId: "run.trial-1", entryPrepared: true };
      }
    });
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const { returns } = await build.run();
    expect(returns[0], JSON.stringify(returns[0])).toMatchObject({ briefId: "b-read", outcome: "done", proposal: { subflowKey: "list_seeds", revision: 1 }, trials: [{ kind: "subflow_trial", receiptId: "run.trial-1" }] });
    expect(asked[0]!.scope).toMatchObject({ buildId: REF.buildId, briefId: "b-read", subflowKey: "list_seeds", parts: [{ partId: "p1", sourceId: "instruction.1", text: "list the spring seeds" }] });
    expect(asked[0]!.scope.successCheck).toEqual([{ fact: "text", op: "contains", value: "Seeds", target: { handle: "t8" } }]);
    expect((await build.store.read(REF))!.returns[0]!.builderReturn).toEqual(returns[0]);
  });

  it("ends a reset that leaves acts on the site as blocked, naming each act still to undo", async () => {
    const left: AutomationStudioSiteResetNamedAct[] = [{ act: "act-1", did: "press \"Add to planting list\" button" }];
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async () => ({ kind: "complete", result: { summary: "done" } })
      },
      remainingActs: async () => left
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "blocked" });
    expect(returns[0]!.reason).toContain("1 act is still to undo: act-1");
    expect(returns[0]).not.toHaveProperty("proposal");
  });

  it("completes a reset only once nothing of the build is left to undo", async () => {
    let left: AutomationStudioSiteResetNamedAct[] = [{ act: "act-1", did: "press \"Add to planting list\" button" }];
    const seenFeedback: unknown[] = [];
    let step = 0;
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("the reset stalled") },
        executeTool: async () => {
          left = [];
          return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, targetsUnchanged: false };
        },
        decide: async ({ evidence }) => {
          seenFeedback.push(...evidence.map((entry) => entry.value));
          step += 1;
          if (step === 2) return { kind: "tool_call", toolId: "site.undo", callId: "undo.1", input: { undoes: "act-1" } };
          return { kind: "complete", result: { summary: "the planting list is as it was" } };
        }
      },
      remainingActs: async () => left
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 4 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    expect(JSON.stringify(seenFeedback)).toContain("project.reset_acts_in_place");
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "done" });
    expect((await build.store.read(REF))!.returns[0]!.builderReturn.outcome).toBe("done");
  });

  it("hands the acts a reset's completion names under cannotUndo to what it asks is left, and ends done once they are kept (t591)", async () => {
    const asked: Array<readonly string[] | undefined> = [];
    let kept = false;
    let step = 0;
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async () => {
          step += 1;
          return step === 1
            ? { kind: "complete", result: { summary: "nothing to undo here" } }
            : { kind: "complete", result: { summary: "the site offers no control that takes it back", cannotUndo: ["act-1"] } };
        }
      },
      // As the ledger does: an act named under cannotUndo once a refusal asked for it is kept from then on.
      remainingActs: async (cannotUndo) => {
        asked.push(cannotUndo);
        if (asked.length > 1 && cannotUndo?.includes("act-1")) kept = true;
        return kept ? [] : [{ act: "act-1", did: "press \"Confirm\" button" }];
      }
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 4 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    expect(asked.slice(0, 2)).toEqual([undefined, ["act-1"]]);
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "done" });
  });

  it("tells a reset whose completion is refused when to name an act under cannotUndo (t591)", async () => {
    const seen: unknown[] = [];
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async ({ evidence }) => {
          seen.push(...evidence.map((entry) => entry.value));
          return { kind: "complete", result: { summary: "done" } };
        }
      },
      remainingActs: async () => [{ act: "act-1", did: "press \"Confirm\" button" }]
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    await build.run();
    const refusal = JSON.stringify(seen);
    expect(refusal).toContain("project.reset_acts_in_place");
    expect(refusal).toContain("complete and name that act under cannotUndo");
  });
});
