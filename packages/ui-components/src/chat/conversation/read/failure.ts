// The notice a chat shows once reading it from FluxIQ keeps failing: which
// step failed and why, in one sentence. No DOM.
//
// A read is two steps (`../controller.ts`): finding the thread (`list`,
// `list-conversations`) and reading its messages (`thread`,
// `get-conversation`). The cause comes from the transport's failure
// code (`ChatResult.code`) or, for an answer the panel could not parse,
// `unreadable`. Core's own error text is shown when it is the only cause there
// is; it never carries the pairing token (`callCoreProgram`).

import type { ChatResult } from "../../ports/index.ts";

type Failure = Extract<ChatResult<unknown>, { ok: false }>;

/** The step of a chat read that failed. */
export type ThreadReadStep = "list" | "thread";

/** The failure code a read gives an answer that is not the shape the panel reads. */
export const UNREADABLE_CODE = "unreadable";

const DETAIL_MAX = 160;

const STEP_WORDS: Readonly<Record<ThreadReadStep, string>> = {
  list: "finding this chat in FluxIQ",
  thread: "reading this chat's messages from FluxIQ"
};

/** The notice for `failure` at `step`: what failed, and why. */
export function readFailureNotice(step: ThreadReadStep, failure: Failure): string {
  return `This chat isn't updating: ${STEP_WORDS[step]} failed (${cause(failure)}).`;
}

function cause(failure: Failure): string {
  const detail = bounded(failure.detail);
  switch (failure.code) {
    case "unreachable":
      return "FluxIQ can't be reached";
    case "timed_out":
      return "FluxIQ didn't answer in time";
    case "no_project":
      return "FluxIQ hasn't said which project this browser belongs to";
    case "not_paired":
      return "this browser isn't paired with FluxIQ";
    case UNREADABLE_CODE:
      return "FluxIQ's answer isn't in a form this panel reads";
    case "failed":
    case "invalid_request":
      return detail ?? "FluxIQ answered with an error";
    default:
      return bounded(failure.cause) ?? detail ?? bounded(failure.sentence) ?? "no reason was given";
  }
}

function bounded(text: string | undefined): string | undefined {
  const trimmed = text?.trim().replace(/[.\s]+$/u, "");
  if (!trimmed) return undefined;
  return trimmed.length > DETAIL_MAX ? `${trimmed.slice(0, DETAIL_MAX - 1)}…` : trimmed;
}
