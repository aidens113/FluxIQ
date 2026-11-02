import type { AutomationStudioAskAnswer } from "./answer.ts";
import type { AutomationStudioParkedRun } from "./parked-run.ts";

/** Why an answer did not move a parked run on. */
export type AutomationStudioParkRefusalReason =
  /** The trace handed in is not a run parked on an ask. */
  | "not_parked"
  /** The answer names another ask than the one this run waits on. */
  | "ask_mismatch"
  /** The ask has already been answered or expired. A run is resumed once. */
  | "already_settled"
  /** Nobody answered, but the ask has not run out of time yet. */
  | "not_expired"
  /** The answer chose an option the ask did not offer. */
  | "unknown_choice";

/**
 * What became of an ask, and where the run goes because of it. A refusal moves
 * nothing: the run stays parked exactly as it was, so the answer can be put
 * right and offered again.
 */
export type AutomationStudioAskSettlement =
  | { outcome: "answered"; route: string; settledAtMs: number; answer: AutomationStudioAskAnswer }
  | { outcome: "expired"; route: string; settledAtMs: number }
  | { outcome: "refused"; reason: AutomationStudioParkRefusalReason; message: string };

/**
 * The route a parked run resumes down, from the answer it was given.
 *
 * Answering with nothing is nobody having answered, and takes the timed-out
 * route -- the node's "if nobody responds" choice, already resolved into
 * `routes.timedOut` when the run parked. Whether the ask had in fact run out of
 * time is the caller's to establish: a port that waited as long as it was told
 * knows it by having waited, and a resume from a stored record knows it from
 * the clock.
 */
export function automationStudioAskSettlement(
  parked: AutomationStudioParkedRun,
  answer: AutomationStudioAskAnswer | undefined,
  nowMs: number
): AutomationStudioAskSettlement {
  if (parked.ask.status !== "pending") {
    return { outcome: "refused", reason: "already_settled", message: `Ask ${parked.ask.askId} was already ${parked.ask.status}. A parked run is resumed once.` };
  }
  if (!answer) return { outcome: "expired", route: parked.routes.timedOut, settledAtMs: nowMs };
  if (answer.askId !== parked.ask.askId) {
    return { outcome: "refused", reason: "ask_mismatch", message: `Answer names ask ${answer.askId}, but this run is parked on ${parked.ask.askId}.` };
  }
  const route = routeForAnswer(parked, answer);
  if (!route) {
    return { outcome: "refused", reason: "unknown_choice", message: `Ask ${parked.ask.askId} does not offer the option ${JSON.stringify(answer.value)}.` };
  }
  return { outcome: "answered", route, settledAtMs: answer.answeredAt, answer };
}

function routeForAnswer(parked: AutomationStudioParkedRun, answer: AutomationStudioAskAnswer): string | undefined {
  if (answer.kind === "deny") return parked.routes.denied;
  if (answer.kind !== "choice") return parked.routes.granted;
  const chosen = parked.ask.options?.find((option) => option.id === answer.value);
  if (!chosen) return undefined;
  return chosen.route ?? parked.routes.granted;
}
