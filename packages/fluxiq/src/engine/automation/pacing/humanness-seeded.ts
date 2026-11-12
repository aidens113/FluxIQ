import { humannessSeedOf, normalizeHumanness } from "@fluxiq/contracts/runtime";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";

/**
 * A run's options with the seed its human pauses draw from: above humanness 0 and with
 * no seed given, one follows from the run's start (a caller replaying a run passes the
 * recorded seed instead). Child frames inherit it through the options they are given.
 * At level 0, or with a seed already given, the very same options come back.
 */
export function automationStudioHumannessSeeded<Options extends Pick<AutomationStudioGraphExecutionOptions, "humanness" | "humannessSeed">>(options: Options, startedAt: number): Options {
  if (normalizeHumanness(options.humanness) <= 0 || options.humannessSeed !== undefined) return options;
  return { ...options, humannessSeed: humannessSeedOf(`run:${startedAt}`) };
}
