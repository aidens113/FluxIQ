import type { RuntimeObservation } from "../../../../runtime/adapters/index.ts";
import type { StateSnapshot } from "../../model/index.ts";

export type AutomationStudioObservation = RuntimeObservation<StateSnapshot>;
