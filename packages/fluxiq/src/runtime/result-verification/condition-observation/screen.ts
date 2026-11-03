import type { AutomationStudioResultConditionObservation } from "../index.ts";
import { automationStudioResultConditionObservation } from "./parse.ts";

/** Screen a typed observation before flattening; withholding never becomes an absent value. */
export function screenAutomationStudioResultConditionObservation(value: unknown, conditionIndex: number, unsafeValue: (value: string) => boolean): { observation: AutomationStudioResultConditionObservation | null | undefined; withheld: boolean } {
  const observation = automationStudioResultConditionObservation(value, conditionIndex);
  if (!observation || observation.state !== "present") return { observation, withheld: observation?.state === "withheld" };
  const unsafe = unsafeValue(observation.value) || /^(?:\(withheld\)|\[withheld\])$/iu.test(observation.value.trim());
  if (!unsafe) return { observation, withheld: false };
  const { value: _value, state: _state, ...provenance } = observation;
  return { observation: { ...provenance, state: "withheld" }, withheld: true };
}
