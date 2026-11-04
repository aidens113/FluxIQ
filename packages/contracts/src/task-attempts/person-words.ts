// Words a person reads on these records: a check's description, where an act
// happened, a subflow's purpose. They are written for a person, so they hold no
// address into a page and no credential.
//
// **What this can and cannot see.** It refuses the shapes that are never words:
// markup, an attribute match, a structural pseudo-class, a path expression, a
// bare `#id` or `.name`, a full address, a run of token-like characters, a
// `Bearer` credential. It cannot tell an address written like a sentence
// (`div.card > a`) from one, and it cannot tell words copied off a page from
// words a person would write. Keeping those out stays the job of whoever writes
// the record: the records hold no field for them, and the parsers refuse any
// key they do not name. Internal to this directory: not re-exported.

import { AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS } from "./limits.ts";

/** Any control character: a line a person reads is one line. */
const CONTROL_CHARACTER = /\p{Cc}/u;

const PAGE_ADDRESS_SHAPES: readonly RegExp[] = [
  /<\/?[a-z][a-z0-9-]*(?:[\s/>]|$)/iu,
  /\[[\w-]+\s*[~|^$*]?=/u,
  /:nth-[a-z-]+\(/u,
  /\/\/[a-z*][\w-]*\[/iu,
  /^[#.][A-Za-z_][\w-]*$/u,
  /[a-z][a-z0-9+.-]*:\/\//iu
];

const TOKEN_RUN = /[A-Za-z0-9_+/=]{32,}/gu;
const BEARER = /\bbearer\s+\S/iu;

/** True for text holding something shaped like a credential: a `Bearer` value, or a long unbroken run of letters and digits. */
export function looksLikeToken(text: string): boolean {
  if (BEARER.test(text)) return true;
  return (text.match(TOKEN_RUN) ?? []).some((run) => /[0-9]/u.test(run) && /[A-Za-z]/u.test(run));
}

/** True for one non-blank line of at most `maxLength` characters, with no page address or credential in it. */
export function isPersonWords(value: unknown, maxLength: number = LIMITS.wordsMaxLength): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) return false;
  if (CONTROL_CHARACTER.test(value) || looksLikeToken(value)) return false;
  return !PAGE_ADDRESS_SHAPES.some((shape) => shape.test(value));
}
