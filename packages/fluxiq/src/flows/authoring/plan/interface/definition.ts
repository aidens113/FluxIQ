import type { AutomationStudioFlowBootstrapInterfacePort } from "./port.ts";

/**
 * A callable part's interface (C2): the values a calling step passes in by
 * name and the values it hands back. An output carries the binding it is read
 * from inside the part, under `metadata.binding` -- the `$state` binding of
 * one of the part's own steps' outputs -- since nothing else in the part
 * crosses to its caller.
 */
export type AutomationStudioFlowBootstrapInterface = {
  inputs: AutomationStudioFlowBootstrapInterfacePort[];
  outputs: AutomationStudioFlowBootstrapInterfacePort[];
};
