import type { AutomationStudioAsk } from "./ask.ts";
import type { AutomationStudioAskAnswer } from "./answer.ts";

/**
 * Where an ask goes, and -- when the host can hold a run in place -- where its
 * answer comes back from.
 *
 * The executor raises asks; it does not know what a conversation is. Binding a
 * port is what turns "this run has a question" into a person being asked. A run
 * with no port bound still parks and is still resumable: the port decides
 * whether anybody hears about it, not whether the run can go on.
 */
export type AutomationStudioParkingPort = {
  /**
   * Opens the ask wherever a person will see it. Throwing fails the run: a
   * question that reached nobody must not become a run that waits forever with
   * no record of why.
   */
  open(ask: AutomationStudioAsk): Promise<void> | void;
  /**
   * Waits for the answer without returning from the run, for a host that can
   * hold one open. Resolving with nothing means nobody answered in time, and
   * the run takes the ask's expired route.
   *
   * A port that leaves this out parks the run durably instead: the run returns
   * `waiting` with everything it needs to be resumed later, which is the shape
   * that survives a restart.
   */
  awaitAnswer?(ask: AutomationStudioAsk, wait: { expiresAtMs?: number; signal?: AbortSignal }): Promise<AutomationStudioAskAnswer | undefined>;
};
