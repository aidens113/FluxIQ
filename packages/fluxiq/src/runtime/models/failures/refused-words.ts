// What a provider's refusal of one request was, in words that finish "failed: ..." or stand as a chat's reason (t1093).
//
// A build the web panel started on 2026-11-27 ended "The build failed: the model could not be reached" when the model
// had answered at once: HTTP 400, "The compiled grammar is too large, which would cause performance issues. Simplify
// your tool schemas or reduce the number of strict tools." The provider said exactly what was wrong, and the words a
// person read said the opposite. So a refusal is said as one, with the provider's own sentence, and "could not be
// reached" is kept for a call that never got an answer (`../../automation-activity/wording/failure-code-words.ts`,
// `../../conversations/instructions/interpret.ts`).
//
// **Only a screened sentence.** The sentence is read from a refusal record (`./refusal/`), which its adapter screened for
// the credential and for locator-shaped text before it was built, and whose bounds hold it to a sentence. A caller passes
// a record from a real failure of this process, or one parsed by the record's own parse, and never a provider's raw body.

/** A refusal as the words read it: its status and the provider's own error, screened. */
type Refusal = { readonly status?: unknown; readonly error?: { readonly type?: unknown; readonly message?: unknown } | null } | null | undefined;

/** How much of the provider's sentence is said; the record already holds it to this (`./refusal/record.ts`). */
const MOST_SAID = 400;

/**
 * `refusal` in words: "the model provider refused the request: <its sentence>" for a 4xx, "the model provider answered
 * with a server error" for a 5xx (its sentence after it where it gave one), and `undefined` for anything that is no
 * refusal record.
 */
export function automationStudioLlmProviderRefusalWords(refusal: Refusal): string | undefined {
  const status = refusal?.status;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 400 || status > 599) return undefined;
  const message = typeof refusal?.error?.message === "string" ? refusal.error.message.replace(/\s+/gu, " ").trim().slice(0, MOST_SAID).replace(/[.\s]+$/u, "") : "";
  const type = typeof refusal?.error?.type === "string" && /^[a-z_]{1,60}$/u.test(refusal.error.type) ? refusal.error.type : "";
  const opening = status >= 500 ? "the model provider answered with a server error" : "the model provider refused the request";
  return message ? `${opening}: ${message}` : type ? `${opening} (${type})` : opening;
}
