// The supervisor's loop run on a scripted stub provider (a list of decisions,
// each read off the evidence it is shown) over a build from
// `./supervisor-fixture.ts`, and the steps those scripts are written with.
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS, runAutomationStudioProjectSupervisorLoop } from "../index.ts";
import { BUILD, HOST_TOOLS, project } from "./supervisor-fixture.ts";

export type Entry = { callId: string; toolId: string; value: unknown };
export type Step = (evidence: readonly Entry[]) => JsonObject;

export const FIND = "Find the three newest titles by Ada Hart";
export const HOLD = "place a hold on the first one";
export const NOTE = "note the hold's collection shelf";

let calls = 0;
export const call = (toolId: string, input: JsonObject | ((evidence: readonly Entry[]) => JsonObject) = {}): Step => (evidence) => ({ kind: "tool_call", toolId, callId: `c${++calls}`, input: typeof input === "function" ? input(evidence) : input });
export const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
export const assembled = (evidence: readonly Entry[]) => lastOf(evidence, IDS.assemble)!.complete as JsonObject;
export const test: Step = call(IDS.testCandidate, assembled);
export const complete: Step = (evidence) => ({ kind: "complete", result: assembled(evidence) });
export const end = (ended: "blocked" | "partial", reason = "The hold control is not on the page."): Step => () => ({ kind: "complete", result: { ended, reason } });

export function brief(subflowKey: string, parts: string[], predecessors: string[] = [], extra: JsonObject = {}): JsonObject {
  return { kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors }, allowanceUsd: 0.05, maxIterations: 20, ...extra };
}
export const reset = (): JsonObject => ({ kind: "reset", subflowKey: "main", entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 5 });
export const dispatch = (briefs: JsonObject[], reason = "Build the subflows the plan needs."): Step => call(IDS.dispatch, { reason, briefs });

export async function supervise(steps: Step[], built = project(), options: {
  tools?: AutomationStudioLlmEvidenceTool[];
  executeTool?: AutomationStudioLlmEvidenceLoopInput["executeTool"];
  maxStepsWithoutProgress?: number;
  /** A stall is thrown out of the loop, as a project build's is (`service.ts`). */
  propagateDecisionErrors?: boolean;
} = {}) {
  let index = 0;
  const seen: Entry[] = [];
  /** Every entry any decision was shown, once each, in the order first shown. */
  const shown = new Map<string, Entry>();
  const offered: string[][] = [];
  const guard = options.maxStepsWithoutProgress ?? steps.length;
  const outcome = await runAutomationStudioProjectSupervisorLoop({
    ports: built.ports,
    loop: {
      tools: options.tools ?? HOST_TOOLS,
      maxIterations: steps.length,
      maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: guard, maxInARow: steps.length, stalled: () => new Error("stalled") },
      ...(options.propagateDecisionErrors ? { propagateDecisionErrors: true } : {}),
      executeTool: options.executeTool ?? (async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true })),
      decide: async ({ evidence, tools }) => {
        offered.push(tools.map((tool) => tool.toolId));
        seen.splice(0, seen.length, ...evidence.map((entry) => ({ callId: entry.callId, toolId: entry.toolId, value: entry.value })));
        for (const entry of seen) {
          const key = `${entry.callId}:${JSON.stringify(entry.value)}`;
          if (!shown.has(key)) shown.set(key, entry);
        }
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence);
      }
    }
  });
  const summary = await built.record.summary(BUILD);
  const view = await built.record.read(BUILD);
  const all = [...shown.values()];
  const feedback = all.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID).map((entry) => entry.value as JsonObject);
  return { outcome, seen, shown: all, offered, summary, view, feedback, ...built };
}
