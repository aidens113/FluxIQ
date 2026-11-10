import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { automationStudioLlmStepLogFlowStep, type AutomationStudioLlmStepLogFlowStep } from "../../../runtime/llm/step-log/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * Where each pass of a Flow run's step loop spends its time (task speed S0 and
 * S10). A saved Flow's replay runs every node here with no tool call around it,
 * so nothing timed a replayed step: an 18-step replay measured 46-48 s with an
 * instant model and no record of where (`run-mwaby832-3a6c67f5`).
 *
 * Each pass over a node is one `flow` step of the step log
 * (`runtime/llm/step-log/flow-step.ts`), from the loop reaching the node to the
 * loop reaching the next one, so Core's own work between nodes is inside a
 * step, not a gap. Its parts are spans: `arrival` (region checks, pace and
 * readiness gate), `execute` (the node's attempt, with the domain's own spans
 * inside it), and the step loop's work after the attempt by the name of the
 * module that does it. Nothing here changes what the run does: with the step
 * log off, or inside a tool step that already times the node, every call only
 * runs its work.
 */
export type AutomationStudioStepTiming = {
  /** The loop reached `node`: the step before it ends and this one begins. */
  begin(node: AutomationStudioFlowNode): void;
  /** `work` as the part `name` of the current pass. */
  phase<T>(name: string, work: () => Promise<T>): Promise<T>;
  /** The node's attempt, as the part `execute`; its status and failure code are the step's outcome. */
  execute(work: () => Promise<AutomationStudioNodeAttemptTrace>): Promise<AutomationStudioNodeAttemptTrace>;
  /** The run left the loop: the current step ends. */
  end(): void;
};

/** A run's step timing, over the step log the process environment names. */
export function automationStudioStepTiming(env: Readonly<Record<string, string | undefined>> = process.env): AutomationStudioStepTiming {
  let step: AutomationStudioLlmStepLogFlowStep | undefined;
  let outcome: { status: string; code?: string } | undefined;
  const close = (): void => {
    step?.finish(outcome);
    step = undefined;
    outcome = undefined;
  };
  const phase = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const current = step;
    if (!current) return await work();
    const startedAt = Date.now();
    try {
      return await current.within(work);
    } finally {
      current.record(name, startedAt, Date.now());
    }
  };
  return {
    begin(node) {
      close();
      step = automationStudioLlmStepLogFlowStep({ nodeId: node.id, definitionId: node.definitionId }, env);
    },
    phase,
    async execute(work) {
      const attempt = await phase("execute", work);
      outcome = { status: attempt.status, ...(attempt.failure?.code ? { code: attempt.failure.code } : {}) };
      return attempt;
    },
    end: close
  };
}
