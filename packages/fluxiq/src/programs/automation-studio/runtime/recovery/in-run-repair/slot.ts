// What an in-run repair's patch request is held to (state-aware recovery plan,
// C6 step 8): the incident's smallest unit by its kind and one id, that unit's
// contract (`./unit-contract.ts`), and the incident with what the run already
// tried and did (`./history.ts`). The recovery that carries it is the same one
// a run that could not hold gets after it ends (`../annotation/annotate.ts`).

import type { AutomationStudioIncidentRepairRequest, AutomationStudioRepairUnit } from "../../executor/lifecycle-run/index.ts";
import type { AutomationStudioLlmInRunRepairContext, AutomationStudioLlmInRunRepairContract, AutomationStudioLlmInRunRepairUnit } from "../../llm/index.ts";
import { automationStudioInRunRepairHistory } from "./history.ts";

/** The request's `inRunRepair` slot for this incident. */
export function automationStudioInRunRepairSlot(input: {
  request: Pick<AutomationStudioIncidentRepairRequest, "unit" | "incident" | "failedAttempt" | "attempts">;
  contract: AutomationStudioLlmInRunRepairContract;
}): AutomationStudioLlmInRunRepairContext {
  const { request } = input;
  return {
    unit: slotUnit(request.unit),
    contract: input.contract,
    ...automationStudioInRunRepairHistory({ incident: request.incident, failedAttempt: request.failedAttempt, attempts: request.attempts })
  };
}

/** The unit by its kind and its one id, as the slot names it. */
function slotUnit(unit: AutomationStudioRepairUnit): AutomationStudioLlmInRunRepairUnit {
  if (unit.kind === "node") return { kind: "node", id: unit.nodeId };
  if (unit.kind === "handler") return { kind: "handler", id: unit.handlerNodeId };
  return { kind: "part", id: unit.subflowId };
}
