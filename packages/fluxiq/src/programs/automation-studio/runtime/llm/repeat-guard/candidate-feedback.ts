// What the model is told, in candidate mode, when a call is refused as a
// repeat (`./feedback.ts`, `./outcomes.ts`).
//
// Candidate mode has no draft (the loop is `discoveryOnly`): nothing can be
// amended, rerun or marked optional, and a round that stalls is not followed by
// a test and judgement of a Flow so far -- the build ends, with nothing tested.
// The legacy notes say both, which lane C (`run-mv0fuotv-805294d7`, C2) was
// told three times for one refused script it sent again unchanged, until the
// build ended with its purse unspent. So in candidate mode no note names the
// draft, and an identical `core.submit_candidate` is answered with the issues
// its first refusal listed, as that refusal gave them (each names the step and
// line it is about, and what to write instead where the check knows).

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRepeatedOutcome } from "./outcomes.ts";

/** The candidate submission tool (`../../flow-bootstrap/candidate/authoring-loop.ts`), read as a plain string so this module does not reach into the build. */
const SUBMIT_CANDIDATE = "core.submit_candidate";

const SAME_CALL = "You already made this exact call -- the same tool with the same input -- on this exact page, and it did not work then, changed nothing, or ended on the same page as the same call before it (then.outcome). "
  + "Making it again from this page does the same, so it was not run and cost nothing but this decision. "
  + "Do something different instead: look at or search the page for what you need, use a different control or a different input, submit a corrected candidate, or ask the person. "
  + "A call that runs after the page has changed is not a repeat.";

const SAME_LOOK = "You already made this exact look -- the same tool with the same input -- on this exact page, and it answered the same twice: its answer is above, under sameAsCall. "
  + "The page has not changed, so asking again answers the same again; it was not run. "
  + "Change your approach: act on what the answers show (press, type into or choose a control the page shows), go to another page, use the page's own search or menus, or look for something different.";

const HANDLE_UNSHOWN = "You already made this exact call -- the same tool with the same input -- on this exact page, and it failed because a handle it names was never shown here (then.resultReason): no call had shown or minted that handle yet, and none has since, so it was not run. "
  + "The call itself may be right. First make the call that shows the handle: look at the page, which lists each control under its handle, "
  + "or for a list's extraction handle detect the list's repeating structure from one of its items, which mints the handle and its fields. "
  + "Once a call has shown it, this same call may be made again with the handle exactly as shown.";

const REFUSED_SUBMISSION = "You already submitted this exact candidate -- the same script, word for word -- and it was refused (sameAsCall, then.resultCode). "
  + "It was the same script, so it was not checked again: it is refused for the same issues, listed under issues as that refusal gave them. "
  + "Change the lines those issues name (each names its step and line where the refusal gave them, and what to write instead where it knows), keep every other line as it is, and submit the whole candidate again.";

const ACCEPTED_SUBMISSION = "You already submitted this exact candidate -- the same script, word for word -- and it was accepted, with the revision and digest it returned (sameAsCall). "
  + "Submitting it again changes nothing, so it was not run. Test that revision, complete with it once its trial answers yes, or submit a changed candidate.";

/** What happens if the same is sent again: this many refused in a row end the build. */
function ending(inARow: number, maxInARow: number, what: string): string {
  if (inARow >= maxInARow - 1) return ` Sending ${what} unchanged again ends this build with nothing tested.`;
  return ` Sending ${what} unchanged again is refused the same way, and ${maxInARow} repeats refused in a row end this build with nothing tested.`;
}

/** The instruction, and for a refused submission its issues, for one repeat refused in candidate mode. */
export function automationStudioLlmEvidenceCandidateRepeatInstruction(input: {
  toolId: string;
  earlier: AutomationStudioLlmEvidenceRepeatedOutcome;
  inARow: number;
  maxInARow: number;
}): { instruction: string; issues?: JsonValue[] } {
  const { toolId, earlier, inARow, maxInARow } = input;
  if (toolId === SUBMIT_CANDIDATE) {
    if (earlier.outcome !== "failed") return { instruction: ACCEPTED_SUBMISSION + ending(inARow, maxInARow, "it") };
    return { instruction: REFUSED_SUBMISSION + ending(inARow, maxInARow, "it"), ...(earlier.issues ? { issues: structuredClone(earlier.issues) } : {}) };
  }
  if (earlier.outcome === "same_answer") return { instruction: SAME_LOOK + ending(inARow, maxInARow, "the same look") };
  if (earlier.handleUnshown) return { instruction: HANDLE_UNSHOWN + ending(inARow, maxInARow, "this call") };
  return { instruction: SAME_CALL + ending(inARow, maxInARow, "this call") };
}
