import type { Humanness } from "./humanness.ts";
import { normalizeHumanness } from "./normalize.ts";

/** Where a run's humanness can come from; `undefined` or `null` means that source set none. */
export type HumannessSources = {
  /** An explicit run option: a FluxNode's options or per-run overrides, the answer-first caller's `humanness`. */
  runOption?: number | null | undefined;
  /** The level stored on the task (Answer First's task record). */
  task?: number | null | undefined;
  /** The level stored on the Flow (`metadata.humanness`). */
  flow?: number | null | undefined;
  /** The request's starting value: the client's own setting, sent with the request. It never overrides a stored level. */
  startingValue?: number | null | undefined;
  /** The person's stored starting value (their identity record's `startingHumanness`), for a request that carried none. */
  person?: number | null | undefined;
};

/**
 * The run's humanness by precedence, highest first: an explicit run option, then the task's
 * stored level, then the Flow's, then the request's starting value, then the person's stored
 * starting value. `undefined` when no source set one, which a run reads as 0 and leaves off its
 * commands, so a run nobody set a level for is today's path exactly. A stored 0 is a level like
 * any other: it wins over a starting value, and a request's 0 wins over the person's value.
 */
export function resolveHumanness(sources: HumannessSources): Humanness | undefined {
  for (const value of [sources.runOption, sources.task, sources.flow, sources.startingValue, sources.person]) {
    if (value !== undefined && value !== null) return normalizeHumanness(value);
  }
  return undefined;
}
