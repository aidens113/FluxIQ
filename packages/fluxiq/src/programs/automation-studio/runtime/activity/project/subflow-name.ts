import type { AutomationStudioProjectStructurePlan } from "../../project-agents/contracts/index.ts";
import { automationStudioProjectCardWords } from "./card-words.ts";

/** The longest subflow name a card or an agent carries. */
const NAME_MAX = 160;

/** A subflow's name as the plan gives it, for a card or a header; its key when the plan does not name it. */
export function automationStudioProjectSubflowName(subflowKey: string, structurePlan?: AutomationStudioProjectStructurePlan): string {
  const name = structurePlan?.plan.subflows.find((subflow) => subflow.key === subflowKey)?.name;
  return (name === undefined ? "" : automationStudioProjectCardWords(name, NAME_MAX)) || automationStudioProjectCardWords(subflowKey, NAME_MAX) || subflowKey;
}
