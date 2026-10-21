// A round stall hands over the draft keeping every carried step's scheduled
// candidate (t690). Each stall used to deep-copy the draft itself, which lends
// a step no candidate (`../../../flow-draft/scheduled-candidate/`), so after one
// stall every unchanged saved step read as never run in this build and the
// model reran each one alone (t688, Lab steps 0095-0120). Covers the
// refusal-run (`../refusal-run.ts`), refused-repeat (`../refused-repeat.ts`)
// and searching (`../searching.ts`) stalls; the loop's own refused-completion
// stall is in `../../tests/evidence-loop-seeded-draft.test.ts`.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowDraftScheduledCandidateCall } from "../../../flow-draft/scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../node-tools/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const press = { toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };
const find = { toolId: "find", description: "Find.", inputSchema: { type: "object" }, effect: "observe" as const };

/** Three saved steps, each scheduled to run as the Flow saved it. */
function savedSeed(): AutomationStudioFlowDraftStep[] {
  return automationStudioFlowDraftSeedFromFlow({
    nodes: [
      { id: "open", definitionId: "fixture.open", metadata: { declaredConsequences: [] } },
      { id: "choose", definitionId: "fixture.choose", parameterValues: { option: "Patio" }, metadata: { declaredConsequences: [] } },
      { id: "read", definitionId: "fixture.read", metadata: { declaredConsequences: [] } }
    ],
    edges: [{ id: "e1", sourceNodeId: "open", targetNodeId: "choose" }, { id: "e2", sourceNodeId: "choose", targetNodeId: "read" }],
    startPages: { open: { location: "fixture://venues" } }
  }).steps;
}

/** Every press on "Gone" is refused by an unchanged page; a find answers and changes nothing. */
function page() {
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => toolId === "find"
    ? { kind: "llm_evidence_tool_execution", evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", stateDigests: { before: "s1", after: "s1" }, draft: { actionId: "web.find", effect: "observe", proposes: false } }
    : { kind: "llm_evidence_tool_execution", stateDigests: { before: "s1", after: "s1" }, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: "web.click", effect: "mutate", proposes: true } });
}

/** The steps the stall handed over, after the loop ran `decisions` and then completes. */
async function stalledSteps(decisions: readonly JsonObject[], issueCodes: readonly string[]): Promise<AutomationStudioFlowDraftStep[]> {
  const handed: Array<{ issueCodes: string[]; steps: AutomationStudioFlowDraftStep[] }> = [];
  const stalledError = new Error("stalled");
  const decide = vi.fn();
  for (const decision of decisions) decide.mockResolvedValueOnce(decision);
  decide.mockResolvedValue({ kind: "complete", result: { done: true } });
  await expect(runAutomationStudioLlmEvidenceLoop({
    tools: [press, find], decide, executeTool: page(), maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true,
    draft: { seed: savedSeed() },
    unusableDecisions: {
      maxConsecutive: 20,
      stalled: (progress) => {
        handed.push({ issueCodes: [...progress.issueCodes], steps: [...progress.steps] });
        return stalledError;
      }
    }
  })).rejects.toBe(stalledError);
  expect(handed.map((stall) => stall.issueCodes)).toEqual([issueCodes]);
  return handed[0]!.steps;
}

function expectScheduled(steps: readonly AutomationStudioFlowDraftStep[]): void {
  const saved = steps.filter((step) => /^f\d$/u.test(step.id ?? ""));
  expect(saved.map((step) => step.id)).toEqual(["f1", "f2", "f3"]);
  for (const step of saved) expect(automationStudioFlowDraftScheduledCandidateCall(step)?.input).toEqual(step.input);
}

const gone = (target: string) => ({ kind: "tool_call", callId: `gone.${target}`, toolId: "press", input: { target: `Gone ${target}` } });

describe("a round stall hands over the draft", () => {
  it("keeps each saved step's scheduled candidate when three refusals of one kind stall the round", async () => {
    const keep = (step: number) => ({ kind: "amend_draft", amendments: [{ step, change: "keep" }] });
    expectScheduled(await stalledSteps([keep(1), keep(2), keep(3)], ["llm_evidence_loop.draft_amendments_refused"]));
  });

  it("keeps each saved step's scheduled candidate when refused repeats stall the round", async () => {
    expectScheduled(await stalledSteps([gone("A"), gone("A"), gone("A"), gone("A"), gone("A")], ["llm_evidence_loop.repeat_refused", "llm_evidence_loop.last_refusal:web.action.rejected.target_unobserved"]));
  });

  it("keeps each saved step's scheduled candidate when looking without acting stalls the round", async () => {
    expectScheduled(await stalledSteps(Array.from({ length: 8 }, (_, index) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `query ${index}` } })), ["llm_evidence_loop.searching_without_acting"]));
  });
});
