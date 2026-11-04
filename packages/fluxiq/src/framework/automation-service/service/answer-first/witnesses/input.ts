import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstWitnessSide } from "./reading.ts";

export type AutomationStudioAnswerFirstWitnessesInput = {
  /** One look at the places the task's changes show, for one side. `undefined` is a look that read nothing. */
  read(side: AutomationStudioAnswerFirstWitnessSide): Promise<JsonObject | undefined>;
};
