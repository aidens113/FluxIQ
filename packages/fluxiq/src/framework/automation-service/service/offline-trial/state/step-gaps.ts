// Which step of a state trial each gap sits on, numbered as the run's feedback numbers steps
// (`../../candidate-trial/executed-steps.ts`). A command does not say which step sent it, so it
// is read from the order: the nth command of an action is the nth attempt that dispatched that
// action, a retry included. A look or any other command no attempt names belongs to the next
// step that does, since a step looks before it acts, and at the end of the run to the last
// step. A run that ran no step names none. Pure.

import type { ClientGatewayTraceStateEngineGap } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioTrialExecutedStep } from "../../candidate-trial/index.ts";

/** One gap of a state trial with the step it sits on; `null` when no step of the run names it. */
export type AutomationStudioOfflineStateTrialStepGap = {
  step: number | null;
  reason: string;
  cause: string;
  actionType: string;
  fields: readonly string[];
  /** Whether the run went on past it. An act's stops the run. */
  wentOn: boolean;
};

export function automationStudioStateTrialStepGaps(input: {
  steps: readonly AutomationStudioTrialExecutedStep[];
  /** Every command's action type, in the order the engine was sent them. */
  commands: readonly string[];
  gaps: readonly ClientGatewayTraceStateEngineGap[];
}): AutomationStudioOfflineStateTrialStepGap[] {
  const stepOfCommand = commandSteps(input.steps, input.commands);
  return input.gaps.map((gap) => ({
    step: stepOfCommand[gap.ordinal - 1] ?? null,
    reason: gap.reason,
    cause: gap.cause,
    actionType: gap.actionType,
    fields: [...gap.fields],
    wentOn: gap.wentOn
  }));
}

/** Each command's step, by the order rule in the header. */
function commandSteps(steps: readonly AutomationStudioTrialExecutedStep[], commands: readonly string[]): readonly (number | null)[] {
  const attemptsByAction = new Map<string, number[]>();
  for (const [index, step] of steps.entries()) {
    for (const attempt of [...step.absorbed.map((entry) => entry.failed), step.attempt]) {
      const action = dispatched(attempt);
      if (action !== undefined) (attemptsByAction.get(action) ?? attemptsByAction.set(action, []).get(action)!).push(index + 1);
    }
  }
  const seen = new Map<string, number>();
  const named = commands.map((action): number | null => {
    const occurrence = seen.get(action) ?? 0;
    seen.set(action, occurrence + 1);
    return attemptsByAction.get(action)?.[occurrence] ?? null;
  });
  const last = steps.length === 0 ? null : steps.length;
  let next: number | null = last;
  const placed: (number | null)[] = new Array<number | null>(named.length).fill(null);
  for (let index = named.length - 1; index >= 0; index -= 1) {
    next = named[index] ?? next;
    placed[index] = next;
  }
  return placed;
}

/** The action a step's attempt dispatched, as the policy dispatch names it in its outputs. */
function dispatched(attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  const { outputs } = attempt;
  const outputId = typeof outputs === "object" && outputs !== null && !Array.isArray(outputs) ? (outputs as { readonly outputId?: unknown }).outputId : undefined;
  return typeof outputId === "string" ? outputId : undefined;
}
