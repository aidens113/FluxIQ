// Whether a draft step went to where the Flow starts.
//
// One reading, published so that nothing else writes a second one: the
// completion's arrival restore (`./start-step.ts`) keeps the step this says
// arrived, and the instructed-acts check (`../instructed-acts/check.ts`) refuses
// that same step as doing any act but opening. A step one of them took for the
// arrival and the other did not would be how a Flow came to be refused for the
// step Core had just put back, or accepted for an add to cart that only arrived.
//
// It reads values, never node ids: Core does not know which node navigates, and
// `./location-agreement.ts` says how loosely a value agrees with a location.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapValuesCarryLocation } from "./location-agreement.ts";

/**
 * Whether a step went to `startLocation`, read off what it ran with -- which is
 * what the Flow is written from -- or, where it carried no such record, what it
 * was written with.
 */
export function automationStudioFlowBootstrapDraftStepGoesToLocation(step: AutomationStudioFlowDraftStep, startLocation: string): boolean {
  return automationStudioFlowBootstrapValuesCarryLocation(step.ranWith ?? step.input, startLocation);
}
