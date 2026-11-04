// What a task's memory says is saved, for the chip beside an answer (`AutomationStudioSavedState`):
// the chat's reader reads this and the attempt's answer carries nothing new. Only a whole run
// judged yes makes a Flow `ready`, and one judged yes once is provisional. Steps that have not
// been proven whole, a first attempt's above all, stay `partly_works` and unproven.

import type { AutomationStudioSavedState } from "@fluxiq/contracts/automation";
import type { AutomationStudioAnswerFirstTaskMemory } from "./memory.ts";

/** What is saved, or nothing where the task has kept neither steps nor notes. */
export function automationStudioAnswerFirstSavedStateOf(memory: AutomationStudioAnswerFirstTaskMemory | undefined): AutomationStudioSavedState | undefined {
  const best = memory?.best;
  if (best?.steps.length) {
    const flowId = memory?.flowId || best.flowId;
    return best.provenWhole
      ? { state: "ready", trust: "provisional", flowId, savedAtMs: best.savedAtMs, lastWorkedAtMs: best.savedAtMs }
      : { state: "partly_works", trust: "unproven", flowId, savedAtMs: best.savedAtMs };
  }
  const note = memory?.notes.at(-1);
  return note ? { state: "notes_only", trust: "unproven", savedAtMs: note.atMs } : undefined;
}
