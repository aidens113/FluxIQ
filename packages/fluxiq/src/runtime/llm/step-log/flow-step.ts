import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder, type AutomationStudioLlmStepLogFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";
import { automationStudioLlmStepLogSpans } from "./span.ts";

/** One node of a Flow run, as the step loop runs it: its id in the Flow and its definition. */
type FlowNode = { nodeId: string; definitionId: string };

/** How the node's pass ended, in closed words: the attempt's status and its failure code. */
type FlowStepOutcome = { status: string; code?: string };

/** One pass of the step loop over one node, timed as an `NNNN-flow-<definitionId>` step. */
export type AutomationStudioLlmStepLogFlowStep = {
  /** `work` as part of this step: every span the domain records inside it is this step's. */
  within<T>(work: () => Promise<T>): Promise<T>;
  /** A part the step loop timed itself, in absolute epoch milliseconds. */
  record(name: string, startedAt: number, finishedAt: number, detail?: string): void;
  /** Writes `meta.json`, which completes the step. A second call does nothing. */
  finish(outcome: FlowStepOutcome | undefined): void;
};

/**
 * One pass of a Flow run over one node, written as an `NNNN-flow-<definitionId>`
 * step (task speed S0 and S10). A saved Flow's replay runs its nodes through the
 * engine's step loop, which no tool call wraps, so until 2026-11-10 a replay left
 * no step at all and its time showed as one gap per attempt. The folder holds
 * `meta.json` alone: kind `flow`, `toolId` the node's definition, `nodeId`, the
 * scope's part, round, phase and agent, `status` and `resultCode` from the
 * attempt, and `spans` -- the step loop's own parts (`arrival`, `execute`, ...)
 * and what the domain timed inside the dispatch (`send.<action>`, `page.<action>`,
 * `pressed`). Never inputs, outputs or page text.
 *
 * Undefined when the step log is off, and when a step is already collecting: a
 * node run inside a tool call (`core.run_node`, a test's replay) is that tool
 * step's, and a second folder would take the spans it is owed.
 */
export function automationStudioLlmStepLogFlowStep(node: FlowNode, env: Readonly<Record<string, string | undefined>> = process.env): AutomationStudioLlmStepLogFlowStep | undefined {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory || automationStudioLlmStepLogSpans.active()) return undefined;
  const scope = automationStudioLlmStepLogScope.current();
  const toolId = typeof node.definitionId === "string" && node.definitionId !== "" ? node.definitionId : "unnamed";
  let folder: AutomationStudioLlmStepLogFolder;
  try {
    folder = automationStudioLlmStepLogOpenFolder(directory, `flow-${automationStudioLlmStepLogNaming.toolSegment(toolId)}`);
  } catch (error) {
    // The disk refused the folder: no step, never a failed node.
    if (automationStudioLlmStepLogFolderRefused(error)) return undefined;
    throw error;
  }
  const started = Date.now();
  const spans: Parameters<typeof automationStudioLlmStepLogSpans.written>[0][number][] = [];
  let finished = false;
  return {
    async within(work) {
      const collected = automationStudioLlmStepLogSpans.collect(work);
      try {
        return await collected.done;
      } finally {
        spans.push(...collected.spans());
      }
    },
    record(name, startedAt, finishedAt, detail) {
      if (finished || spans.length >= 200 || !Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) return;
      spans.push({ name, startedAt, finishedAt, ...(detail !== undefined ? { detail } : {}) });
    },
    finish(outcome) {
      if (finished) return;
      finished = true;
      try {
        const ended = Date.now();
        const status = outcome?.status ?? "ended";
        const summary = outcome?.code ? `${toolId} ${status} ${outcome.code}` : `${toolId} ${status}`;
        automationStudioLlmStepLogWriter(folder.path).meta({
          step: folder.step, kind: "flow", callId: null, toolId, nodeId: typeof node.nodeId === "string" ? node.nodeId : null,
          startedAt: new Date(started).toISOString(), finishedAt: new Date(ended).toISOString(), ms: ended - started,
          part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? automationStudioLlmStepLogNaming.phaseOfKind("flow"),
          role: scope?.role ?? null, briefId: scope?.briefId ?? null,
          status, resultCode: outcome?.code ?? null, summary,
          ...(spans.length > 0 ? { spans: automationStudioLlmStepLogSpans.written(spans, started) } : {})
        });
        automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "flow", tool: toolId, summary, costUsd: undefined, role: scope?.role, briefId: scope?.briefId });
      } catch {
        /* best-effort: a step that cannot be finished never fails the run */
      }
    }
  };
}
