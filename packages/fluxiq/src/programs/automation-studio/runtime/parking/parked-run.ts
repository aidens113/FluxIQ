import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskRoutes } from "./ask.ts";

/**
 * One node's place in a list it was iterating, carried across a park.
 *
 * Declared structurally rather than imported from the node catalog. Parking is
 * reached from a node definition, so importing the catalog here would close a
 * module cycle; the shape is `AutomationNodeIterationState`, and the executor,
 * where both are in scope, is where the compiler checks that it still is.
 */
export type AutomationStudioCarriedIteration = { items: JsonValue[]; index: number };

/**
 * What a parked run held that its trace does not already carry.
 *
 * Deliberately not a second copy of the run: `values`, `attempts`, `effects`
 * and the region transitions are on the trace the parked run returned, and
 * duplicating them here would double what is persisted and leave two records
 * to disagree. What is here is what lives only in memory while a run executes
 * -- its variables, its loop positions, and how much of its step budget it has
 * spent -- and would otherwise be lost the moment the run returned.
 */
export type AutomationStudioParkedRunCarry = {
  variables: Record<string, JsonValue>;
  loops: Record<string, AutomationStudioCarriedIteration>;
  /** Steps already spent, so a resumed run inherits the budget rather than a fresh one. */
  stepsTaken: number;
  maxSteps: number;
  callFlowAttemptPath?: string[];
};

/**
 * A run stopped on a question, and everything needed to go on from it.
 *
 * It rides on the trace, which is what the runtime already persists, so a
 * parked run survives wherever its run record survives and needs no store of
 * its own. Resuming reads this beside the trace it sits on and carries on from
 * the node named here -- it never runs the node again, so nothing the run
 * already did happens twice.
 */
export type AutomationStudioParkedRun = {
  ask: AutomationStudioAsk;
  /** The node the run stopped at. Resuming routes out of it; it is not executed again. */
  nodeId: string;
  definitionId: string;
  attemptId: string;
  parkedAtMs: number;
  /** When nobody answering starts to count as an answer. Absent waits indefinitely. */
  expiresAtMs?: number;
  routes: AutomationStudioAskRoutes;
  carried: AutomationStudioParkedRunCarry;
};

/**
 * Where an ask that names no routes of its own resumes: on through the node's
 * success route when it is answered, out of its failure route when it is
 * refused or nobody answers. A node with branch routes of its own -- Approval's
 * `approved` and `rejected` -- names them on the ask instead.
 */
export const AUTOMATION_STUDIO_DEFAULT_ASK_ROUTES: AutomationStudioAskRoutes = Object.freeze({ answered: "success", denied: "failed", expired: "failed" });

export function automationStudioParkedRun(input: {
  ask: AutomationStudioAsk;
  nodeId: string;
  definitionId: string;
  attemptId: string;
  parkedAtMs: number;
  carried: AutomationStudioParkedRunCarry;
}): AutomationStudioParkedRun {
  const declared = input.ask.routes ?? AUTOMATION_STUDIO_DEFAULT_ASK_ROUTES;
  // `onTimeout: "deny"` is resolved now rather than at answering time, so the
  // record says outright where nobody answering leads.
  const routes: AutomationStudioAskRoutes = input.ask.onTimeout === "deny" ? { ...declared, expired: declared.denied } : declared;
  const timeoutMs = input.ask.timeoutMs ?? 0;
  return {
    ask: input.ask,
    nodeId: input.nodeId,
    definitionId: input.definitionId,
    attemptId: input.attemptId,
    parkedAtMs: input.parkedAtMs,
    ...(timeoutMs > 0 ? { expiresAtMs: input.parkedAtMs + timeoutMs } : {}),
    routes,
    carried: input.carried
  };
}
