import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstWitnessSide } from "./reading.ts";

export type AutomationStudioAnswerFirstWitnessesInput = {
  /** One look at the places the task's changes show, for one side. `undefined` is a look that read nothing. */
  read(side: AutomationStudioAnswerFirstWitnessSide): Promise<JsonObject | undefined>;
  /**
   * Acts an earlier attempt made are carried into this one (`./earlier.ts`), with the reading taken
   * before them where it is still held. Held, it is this attempt's before side, and nothing reads that
   * side again. Not held, the judge is told an earlier attempt took it, and no reading of this
   * attempt's is shown as it.
   */
  earlier?: { before?: JsonObject | undefined } | undefined;
  /** Told the one reading from before every act this attempt's judge sees, so a later attempt carrying them can start from it (`./before-readings.ts`). */
  keep?(before: JsonObject): void;
};
