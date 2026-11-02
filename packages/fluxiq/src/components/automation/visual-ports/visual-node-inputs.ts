import type { AutomationNodePort } from "../contracts.ts";
import { controlInput } from "./control-input.ts";

export function visualNodeInputs(inputs: AutomationNodePort[] = []): AutomationNodePort[] {
  return [controlInput(), ...inputs];
}
