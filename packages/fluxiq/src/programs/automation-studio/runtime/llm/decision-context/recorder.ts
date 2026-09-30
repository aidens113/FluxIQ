// The record of every decision a build made and what Core answered it.
//
// One row per decision, in the order they were made, plus the redirects Core
// gave. The loop records a row as it answers a decision and asks, in the same
// call, how many times that decision has now been made: an answered request, a
// refused completion or an unusable reply is told so on the note the loop shows
// next ("the third time, as at 6 and 7"), which is what the model never learnt
// from the note alone.
//
// Nothing the model wrote in prose, and nothing a page said, is held here: a
// completion's feedback is reduced to its closed codes as it is recorded
// (`./closed-detail.ts`) and the feedback itself is dropped.

import { automationStudioLlmDecisionContextClosedDetail } from "./closed-detail.ts";
import type {
  AutomationStudioLlmDecisionContextDecision,
  AutomationStudioLlmDecisionContextRecord,
  AutomationStudioLlmDecisionContextRepeat
} from "./decision.ts";

export class AutomationStudioLlmDecisionContextRecorder {
  readonly #records: AutomationStudioLlmDecisionContextRecord[] = [];
  /** Iterations at which each decision key was made, oldest first. */
  readonly #seen = new Map<string, number[]>();

  /**
   * Records one decision made at `iteration` and answers how often it has now
   * been made, this time included. Only a decision of the model's has a
   * signature; the initial look and a redirect answer nothing.
   *
   * Iterations never go backwards: a row recorded out of order would put a
   * repeat before the decision it repeats.
   */
  record(iteration: number, decision: AutomationStudioLlmDecisionContextDecision): AutomationStudioLlmDecisionContextRepeat | undefined {
    if (!Number.isInteger(iteration) || iteration < 0) throw new Error(`Decision history iteration must be a non-negative integer, got ${iteration}.`);
    const last = this.#records.at(-1);
    if (last && iteration < last.iteration) throw new Error(`Decision history iteration ${iteration} is before the last recorded iteration ${last.iteration}.`);

    const detail = decision.kind === "completion" ? automationStudioLlmDecisionContextClosedDetail(decision.feedback) : undefined;
    // The feedback is not kept: its closed codes are `detail`.
    const held: AutomationStudioLlmDecisionContextDecision = decision.kind === "completion"
      ? { kind: "completion", signature: decision.signature, draftRevision: decision.draftRevision, accepted: decision.accepted, issueCodes: [...decision.issueCodes], dryRun: decision.dryRun }
      : decision;
    const key = decisionKey(held);
    const iterations = key === undefined ? undefined : [...(this.#seen.get(key) ?? []), iteration];
    if (key !== undefined && iterations) this.#seen.set(key, iterations);
    const firstSeenAt = iterations && iterations[0]! < iteration ? iterations[0] : undefined;
    this.#records.push({
      iteration,
      decision: held,
      ...(detail ? { detail } : {}),
      ...(firstSeenAt !== undefined ? { firstSeenAt } : {})
    });
    return iterations ? { times: iterations.length, iterations } : undefined;
  }

  /**
   * How often a decision with this signature has been made, without recording
   * one. A completion is counted by its answer, not its signature, so it is
   * never found here.
   */
  repeats(signature: string): AutomationStudioLlmDecisionContextRepeat {
    const iterations = this.#seen.get(signature) ?? [];
    return { times: iterations.length, iterations: [...iterations] };
  }

  /** Every row, oldest first. */
  records(): readonly AutomationStudioLlmDecisionContextRecord[] {
    return [...this.#records];
  }
}

/**
 * What two decisions share when they are the same decision. A completion is
 * the same attempt when it met the same answer over the same draft revision;
 * every other decision is its signature, so an answered request counts the
 * executed call it repeats.
 */
function decisionKey(decision: AutomationStudioLlmDecisionContextDecision): string | undefined {
  if (decision.kind === "look" || decision.kind === "redirect") return undefined;
  return decision.kind === "completion" ? completionKey(decision) : decision.signature;
}

/** A key no signature can equal: every signature is a JSON array whose first cell is not this word. */
function completionKey(decision: Extract<AutomationStudioLlmDecisionContextDecision, { kind: "completion" }>): string {
  return JSON.stringify(["completion.answer", decision.draftRevision, decision.accepted, [...new Set(decision.issueCodes)].sort()]);
}
