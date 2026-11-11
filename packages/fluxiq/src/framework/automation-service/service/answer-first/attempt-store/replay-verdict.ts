// How a replay of the saved Flow was checked, as the attempt's row keeps it (task speed S9, t897): it
// stood on its own record, or a named deviation from the accepted run sent it to the judge. The words
// are the contract's (`AutomationStudioTaskOutcomeReplay`); what writes them is the completion
// (`../completion/replay-verdict.ts`). Read as strictly as the rest of a stored row (`./store.ts`).

import { AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS, type AutomationStudioTaskOutcomeReplay, type AutomationStudioTaskReplayDeviation } from "../../../../../api-contracts/automation.ts";

export type AutomationStudioAnswerFirstReplayVerdict = AutomationStudioTaskOutcomeReplay;

/** A kept verdict read strictly: anything but the contract's two shapes, with a deviation it names, is no verdict this reads. */
export function automationStudioAnswerFirstReplayVerdictRead(value: unknown): AutomationStudioAnswerFirstReplayVerdict | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as { stood?: unknown; deviation?: unknown };
  const keys = Object.keys(held);
  if (held.stood === true && keys.length === 1) return { stood: true };
  const known: readonly string[] = AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS;
  if (held.stood === false && keys.length === 2 && typeof held.deviation === "string" && known.includes(held.deviation)) return { stood: false, deviation: held.deviation as AutomationStudioTaskReplayDeviation };
  return undefined;
}
