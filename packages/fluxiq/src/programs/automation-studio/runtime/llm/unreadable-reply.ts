// A reply the provider sent that Core could not read a decision out of, and
// how a loop that asks again keeps count of them.
//
// **What this is not.** A decision the loop read and refused -- a completion
// the check turned down, a look withdrawn, a call that repeats itself -- is the
// model's choice, and the no-progress guard is right to count it. An
// unreadable reply is not a choice at all: the provider's answer arrived and
// could not be read -- broken JSON, cut off, wrapped in prose, not the object
// asked for. Counting it as a step without progress set off the stall
// redirection, which changes what the model is offered, for a model that had
// not repeated anything; and a few in a row ended the round as if the model
// were stuck (`run-munv53gt-a0e6f545`: four in a row, then a good reply).
//
// So an unreadable reply has its own count. It is asked again with the same
// context and a short note of what could not be read (`./unusable-decision.ts`),
// it is paid for and counted in the budget like any decision, and only an
// unbroken run of them -- `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW`
// -- ends the loop, as `llm_evidence_loop.unreadable_replies` with how many
// there were and which cases, which the build says to the person in words
// (`../flow-bootstrap/unfinished-build/replies-unreadable.ts`).
//
// Codes, counts and the closed case list only: never a word of the reply.

import type { AutomationStudioLlmProviderReplyCase } from "./reply-account.ts";

/**
 * Unreadable replies in a row after which a loop that asks again stops. The
 * live record has runs of up to four followed by a good reply, so this leaves
 * room past that; the budget binds underneath it either way.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW = 6;

/**
 * The provider codes for a reply that arrived and could not be read. A
 * timeout, a network failure or a rate limit is not one: nothing arrived.
 */
const UNREADABLE_REPLY_CODES: ReadonlySet<string> = new Set([
  "llm.provider_malformed_response",
  "llm.provider_output_truncated",
  "llm.provider_output_padding_truncated",
  "llm.provider_response_oversize",
  "llm.provider_output_invalid",
  "llm.provider_usage_invalid"
]);

/** What could not be read, in words the model and the person both read. */
const CASE_SAID: Readonly<Record<AutomationStudioLlmProviderReplyCase, string>> = Object.freeze({
  media_type: "it did not come back as JSON",
  envelope_not_json: "the provider's envelope around it was not JSON",
  envelope_shape: "the provider's envelope held no single answer",
  content_missing: "it held no text",
  finish_reason: "the provider stopped it before it was finished",
  content_empty: "it was empty",
  content_fenced: "the JSON was wrapped in a Markdown code fence",
  content_prefixed: "there was text before the JSON object",
  content_not_object: "it was not a JSON object",
  content_unclosed: "the JSON object never closed: it stopped part-way through",
  content_trailing: "there was more text after the JSON object",
  content_mismatched: "its brackets did not match: one closed the wrong kind, or there was one too many or too few",
  content_invalid: "the JSON did not parse: a bad escape, an unescaped quote, a trailing comma or an unquoted key"
});

/** The same, for the provider codes that carry no case of their own. */
const CODE_SAID: Readonly<Record<string, string>> = Object.freeze({
  "llm.provider_output_truncated": "it reached the reply length limit and was cut off",
  "llm.provider_output_padding_truncated": "it reached the reply length limit without saying anything",
  "llm.provider_response_oversize": "it was larger than a reply may be",
  "llm.provider_output_invalid": "it was JSON, but not the decision object asked for",
  "llm.provider_usage_invalid": "the provider's token count for it did not add up"
});

/** Whether a failed decision call's codes say its reply arrived and could not be read. */
export function automationStudioLlmReplyUnreadable(issueCodes: readonly string[]): boolean {
  return issueCodes.length > 0 && issueCodes.every((code) => UNREADABLE_REPLY_CODES.has(code));
}

/** What could not be read, as a clause: from the reply's case where it has one, otherwise from its code. */
export function automationStudioLlmUnreadableReplySaid(reply: { case?: string | undefined; issueCodes?: readonly string[] | undefined }): string {
  const byCase = reply.case ? CASE_SAID[reply.case as AutomationStudioLlmProviderReplyCase] : undefined;
  return byCase ?? reply.issueCodes?.map((code) => CODE_SAID[code]).find((said) => said !== undefined) ?? "it could not be read";
}

/** How many unreadable replies a loop met, and which kinds. */
export type AutomationStudioLlmEvidenceLoopUnreadable = {
  /** The unbroken run that ended the loop. */
  inARow: number;
  /** Every unreadable reply of the loop, the run included. */
  total: number;
  /** Each distinct case or code, commonest first, at most four. */
  cases: string[];
  /** The commonest, said in words (`automationStudioLlmUnreadableReplySaid`), for the build's ending to quote. */
  said: string;
};

/** The loop's count of unreadable replies. */
export type AutomationStudioLlmUnreadableReplies = {
  /** A reply was read, whatever it then said: the run is broken. */
  readable(): void;
  /** One more unreadable reply. True when it is the one that ends the loop. */
  unread(kind: string): boolean;
  readonly inARow: number;
  summary(): AutomationStudioLlmEvidenceLoopUnreadable;
};

export function automationStudioLlmUnreadableReplies(maxInARow: number): AutomationStudioLlmUnreadableReplies {
  let inARow = 0;
  let total = 0;
  const kinds = new Map<string, number>();
  return {
    readable() {
      inARow = 0;
    },
    unread(kind) {
      inARow += 1;
      total += 1;
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      return inARow >= maxInARow;
    },
    get inARow() {
      return inARow;
    },
    summary() {
      const cases = [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([kind]) => kind).slice(0, 4);
      return { inARow, total, cases, said: automationStudioLlmUnreadableReplySaid({ case: cases[0], issueCodes: cases.slice(0, 1) }) };
    }
  };
}
