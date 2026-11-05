// What a task's memory says is saved, for the chip beside an answer (`AutomationStudioSavedState`):
// the chat's reader reads this and the attempt's answer carries nothing new. Only a whole run
// judged yes makes a Flow `ready`, and one judged yes once is provisional. Steps that have not
// been proven whole, a first attempt's above all, stay `partly_works` and unproven.

import type { AutomationStudioSavedState } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstKeptState } from "./kept-state.ts";
import type { AutomationStudioAnswerFirstTaskMemory } from "./memory.ts";

/** What is saved, or nothing where the task has kept neither steps nor notes. */
export function automationStudioAnswerFirstSavedStateOf(memory: AutomationStudioAnswerFirstTaskMemory | undefined): AutomationStudioSavedState | undefined {
  const best = memory?.best;
  if (best?.steps.length) {
    const flowId = memory?.flowId || best.flowId;
    if (best.provenWhole) return { state: "ready", trust: "provisional", flowId, savedAtMs: best.savedAtMs, lastWorkedAtMs: best.savedAtMs };
    // Steps that never assembled into a saved draft are notes, as the attempt's own record reads them (`./kept-state.ts`).
    return automationStudioAnswerFirstKeptState({ steps: true, assembled: best.candidateId !== undefined }) === "partly_works"
      ? { state: "partly_works", trust: "unproven", flowId, savedAtMs: best.savedAtMs }
      : { state: "notes_only", trust: "unproven", savedAtMs: best.savedAtMs };
  }
  const note = memory?.notes.at(-1);
  return note ? { state: "notes_only", trust: "unproven", savedAtMs: note.atMs } : undefined;
}
