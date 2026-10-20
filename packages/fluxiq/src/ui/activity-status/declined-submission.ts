// A submission of steps Core refused, read from its row when Core's own reading
// of the row does not say so.
//
// A builder sends the steps it wrote with a submission tool (`core.submit_*`:
// a candidate build's whole Flow, a project builder's subflow). Core answers
// one it accepts with no result code, and one it refuses under the refusal's
// code (`flow-bootstrap/candidate/submission-refusal.ts` in FluxIQ Core). A
// candidate build's refusal reaches the chat in words (`Declined: ...`), but a
// project builder's did not: its `flow_bootstrap.completion_refused` family
// ("..._parameters_unresolved") matched no failing word and its card read a
// green "Done", while the `subflow.scope_refused` just above it read "Didn't
// work" (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, screenshot 00012, t649).
// Nothing of a refused submission was saved, so it is "not done", never
// "didn't work" and never "done", whichever code refused it.
//
// The words never name the code: what was wrong is said by the builder's next
// decision, and the card says only that the steps were not taken. Since t649's
// second round Core reads every `core.submit_*` and `core.test_*` answer itself
// and says how it went in words (`Declined: ...`, Core's
// `runtime/activity/candidate/result.ts`), so this is a safety net for a row
// that carries no such account of Core's, as an older Core sends. Pure.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** A tool that sends the steps a builder wrote, to be checked and saved. */
const SUBMISSION = /^core\.submit_[a-z_]+$/u;
/** The result code in a row's record ("Result: X · ..."). */
const RESULT = /(?:^|·\s*)Result:\s*([^\s·]+)/u;
/** Core's own words on how the call went: when it gave them, its reading stands. */
const CORE_SAID = /(?:^|\s·\s)(?:Said|Declined|Changed): /u;
/** A submission refused as the same steps sent again. */
const UNCHANGED = /unchanged/u;

const SENT_AGAIN = "it was the same as the steps already sent, sent again unchanged";
const NOT_RUNNABLE = "some steps weren't written in a way the Flow can run";

/**
 * Why Core did not take the steps `event`'s row sent, in words that follow
 * "Not done: "; undefined for any other row, a submission still under way,
 * one Core accepted, and one Core already said how it went in words.
 */
export function declinedSubmission(event: ClientGatewayActivity): string | undefined {
  const detail = event.detail;
  if (detail?.kind !== "tool" || detail.status === "started" || !detail.ref || !SUBMISSION.test(detail.ref)) return undefined;
  const text = detail.text ?? "";
  if (CORE_SAID.test(text)) return undefined;
  const code = RESULT.exec(text)?.[1];
  if (code === undefined) return undefined;
  return UNCHANGED.test(code) ? SENT_AGAIN : NOT_RUNNABLE;
}
