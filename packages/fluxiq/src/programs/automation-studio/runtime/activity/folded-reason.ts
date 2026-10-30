// The one sentence Core writes for a step it folded (a call it defaulted or derived
// so the model no longer decides it), so the chat still shows the step and why.

import { automationStudioActivityReasonText } from "./wording/index.ts";

/** Longest folded reason said, in characters. */
const MAX_FOLDED_REASON = 200;

/** `text` as one plain clause: screened as every reason is, trimmed, no closing stop, or undefined when nothing is left. */
function clause(text: string): string | undefined {
  const said = automationStudioActivityReasonText(text, MAX_FOLDED_REASON)?.replace(/[.!?…\s]+$/u, "").trim();
  return said ? said : undefined;
}

/** "Core did X because Y." for a folded step, screened as the observer screens a reason; undefined when either part reduces to nothing. */
export function automationStudioActivityFoldedReason(input: { did: string; because: string }): string | undefined {
  const did = clause(input.did);
  const because = clause(input.because);
  if (!did || !because) return undefined;
  const lowered = because.charAt(0).toLowerCase() + because.slice(1);
  const done = did.charAt(0).toLowerCase() + did.slice(1);
  return `Core ${done} because ${lowered}.`;
}
