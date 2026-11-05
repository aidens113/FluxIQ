import type { AutomationStudioSubflowCardCheck } from "@fluxiq/contracts/automation";
import type { AutomationStudioSubflowContract } from "../../../engine/automation/lifecycle/index.ts";
import { partCheckOf } from "./condition-digest.ts";

/** The check a part's own `fluxiq.successCheck` makes: what proves it finished. Undefined when it declares none. */
export function partEndCheckOf(contract: Pick<AutomationStudioSubflowContract, "successCheck">): AutomationStudioSubflowCardCheck | undefined {
  return partCheckOf(contract.successCheck, "The part's own end check holds.");
}
