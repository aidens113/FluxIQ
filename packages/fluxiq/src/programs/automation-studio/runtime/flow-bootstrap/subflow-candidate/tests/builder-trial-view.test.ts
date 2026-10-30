// A builder's test that moved the tab shows the page it left (`../builder-loop.ts`,
// `../../candidate/trial-view.ts`, t738).
//
// Photo rerun round 2 (`run-mvgf801u-cc23575e`, 0057-0069): a test refused after
// the start check loaded the build's start answered with no page, and the model
// pressed a stale handle. Office (`run-mvgf04kw-310fc169`, 0126 and 0159): the
// reset's own look at a place moved the tab, and the refusal said nothing moved.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialRequest } from "../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };
/** The page the look finds after the test: where the tab stands. */
const PAGE = { page: "PAGE \"Saved recipes\"\nURL ~/recipes/saved", handles: ["t44"] };
const REFUSAL = { ok: false, code: "candidate.trial_reset_required", instruction: "Undo each act listed under actsToUndo.", actsToUndo: [{ act: "act-2", did: "saved a recipe" }] };

type Entry = { callId: string; toolId: string; value: unknown };

/** Submits, tests, then ends blocked where no yes completed the brief; answers what the model was shown for its test, and the looks the loop took. */
async function tested(options: { reset?: { moved: boolean; movesDuring: number } | undefined; moves?: boolean; trialRuns?: boolean }) {
  let moved = 0;
  const looks: string[] = [];
  let shown: JsonObject | undefined;
  const reset: AutomationStudioSiteResetTrialReset | undefined = options.reset ? {
    beforeTrial: async () => {
      moved += options.reset!.movesDuring;
      return { kind: "refuse", evidence: structuredClone(REFUSAL), moved: options.reset!.moved };
    },
    trialRan: () => []
  } : undefined;
  const port = async (request: AutomationStudioSubflowTrialRequest) => ({ partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes" as const, feedback: {}, entryPrepared: true });
  const steps: Array<(evidence: readonly Entry[]) => JsonObject> = [
    () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) }),
    (evidence) => {
      const accepted = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
      return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: { revision: accepted.revision!, digest: accepted.digest! } };
    },
    // After a refusal the model ends the brief; after a yes Core completes it, and this is never asked (t811).
    () => ({ kind: "complete", result: { ended: "blocked", reason: "The reset could not be met in this test." } })
  ];
  let index = 0;
  await runAutomationStudioSubflowBuilderLoop({
    scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission(),
    trial: { port, ...(reset ? { reset } : {}), ...(options.moves === false ? {} : { moves: () => moved }) },
    // What the model is shown for its test: the answer the builder gives the loop, whatever decision follows it.
    observe: (loop) => ({
      ...loop,
      executeTool: async (call) => {
        const answered = await loop.executeTool(call);
        if (call.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID) shown = (answered as { evidence?: JsonObject }).evidence;
        return answered;
      }
    }),
    loop: {
      tools: [look], maxIterations: 6, maxToolCalls: 8,
      unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
      executeTool: async (call) => {
        if (call.callId.endsWith(".page")) {
          looks.push(call.callId);
          return { kind: "llm_evidence_tool_execution", evidence: structuredClone(PAGE), effectApplied: false, targetsUnchanged: true };
        }
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true };
      },
      decide: async ({ evidence }) => steps[index++]!(evidence as readonly Entry[])
    }
  });
  return { shown: shown!, looks };
}

describe("a builder's test and the page it left", () => {
  it("shows where the tab stands after a refusal whose reset looked at a place itself, though the reset said nothing moved", async () => {
    const { shown, looks } = await tested({ reset: { moved: false, movesDuring: 1 } });
    expect(looks).toEqual(["test.page"]);
    expect(shown).toMatchObject({ code: "candidate.trial_reset_required", actsToUndo: REFUSAL.actsToUndo, pageAfterTrial: PAGE });
    expect(String(shown.pageAfterTrialNote)).toContain("No trial ran, but Core's own checks before it moved the target");
    expect(String(shown.pageAfterTrialNote)).toContain("the page where it stands now");
  });

  it("shows the page after a refusal the reset itself said moved the tab, with no count of moves given", async () => {
    const { shown } = await tested({ reset: { moved: true, movesDuring: 0 }, moves: false });
    expect(shown).toMatchObject({ code: "candidate.trial_reset_required", pageAfterTrial: PAGE });
  });

  it("shows the page a trial that ran left", async () => {
    const { shown, looks } = await tested({});
    expect(looks).toEqual(["test.page"]);
    expect(shown).toMatchObject({ partial: true, verdict: "yes", pageAfterTrial: PAGE });
    expect(String(shown.pageAfterTrialNote)).toContain("as this trial left it");
  });

  it("adds nothing to a refusal that moved nothing", async () => {
    const { shown, looks } = await tested({ reset: { moved: false, movesDuring: 0 } });
    expect(looks).toEqual([]);
    expect(shown).toEqual(REFUSAL);
  });
});
