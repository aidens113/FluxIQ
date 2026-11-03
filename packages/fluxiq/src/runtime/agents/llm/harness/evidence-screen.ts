// What no piece of evidence may carry to a provider, whichever slot of a
// request it travels in.
//
// Two findings, each looked for at every depth, in keys as well as in values.
//
// A key the bound domain declared it denies. The domain knows what raw payload
// and directly executable locators are called in its medium; Core does not,
// and enforces the domain's declaration (see `failure-evidence.ts` for why Core
// keeps no such list of its own). Keys are compared the way the evidence bound
// compares them, so `innerHTML`, `inner_html` and `inner-html` are one key.
//
// A string shaped like a credential. A domain is expected to strip secrets
// before evidence reaches Core -- the web domain drops input values, query
// strings and anything whose signature says it holds one -- and this is the
// backstop for the day it misses one. Unlike a key, a credential has the same
// shape in every medium, so Core can name these itself. The shapes are
// deliberately narrow, because page text reaches this check: each needs a
// distinctive prefix or structure, and the open-ended ones need a long run
// with a digit in it, so `task-list`, `Bearer YOUR_API_TOKEN_HERE` and a
// product code are ordinary text.
//
// A card number is the one shape here that is not a credential, and the one
// with no prefix (t728, extension-core boundary audit, finding 9; the web
// domain's `withheld.ts` screened it alone until then). It is a run of 13 to
// 19 digits that passes the Luhn check, is written as a card is (unbroken, in
// fours, or Amex's and Diners' 4-6-5 and 4-6-4) and starts with a digit a
// payment card's issuer number starts with (2 to 6). The grouping and issuer
// rules are what keep an order number (`112-5550123-4567890`) or a millisecond
// timestamp (`1727712000000`), one in ten of which passes Luhn by chance, from
// being caught. `automationStudioWithoutCardNumbers` withholds the run alone,
// so a domain can keep the words around it rather than lose the whole string.

import { automationStudioEvidenceKey } from "./failure-evidence.ts";

const CREDENTIAL_SHAPES: readonly RegExp[] = [
  // A PEM-encoded private key of any kind.
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/u,
  // A JSON Web Token: two base64url JSON objects and a signature.
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}/u,
  // An authorization header's bearer credential.
  /\bbearer\s+(?=[A-Za-z0-9._~+/=-]*[0-9])(?=[A-Za-z0-9._~+/=-]*[A-Za-z])[A-Za-z0-9._~+/=-]{20,}/iu,
  // An API key in the `sk-` shape DeepSeek and other model providers issue.
  /\bsk-(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{20,}/u,
  // An AWS access key id.
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  // A GitHub token.
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u,
  // A Slack token.
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u
];

/** What a screen found. Both are refusals; which one is for the caller's own record, never the value. */
export type AutomationStudioLlmEvidenceScreenResult = { deniedKey: boolean; secretShaped: boolean };

/**
 * Screens a value for keys the domain denies and for credential-shaped text.
 *
 * `deniedKeys` is the domain's declaration, passed as declared: an empty list
 * denies nothing, and a caller that has no declaration must refuse rather than
 * pass one. A value that refers to itself is walked once.
 */
export function screenAutomationStudioLlmEvidence(value: unknown, deniedKeys: readonly string[]): AutomationStudioLlmEvidenceScreenResult {
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const found: AutomationStudioLlmEvidenceScreenResult = { deniedKey: false, secretShaped: false };
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length && !(found.deniedKey && found.secretShaped)) {
    const item = pending.pop();
    if (typeof item === "string") {
      if (!found.secretShaped && credentialShaped(item)) found.secretShaped = true;
      continue;
    }
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) pending.push(child);
      continue;
    }
    for (const [key, child] of Object.entries(item)) {
      if (denied.has(automationStudioEvidenceKey(key))) found.deniedKey = true;
      if (!found.secretShaped && credentialShaped(key)) found.secretShaped = true;
      pending.push(child);
    }
  }
  return found;
}

function credentialShaped(text: string): boolean {
  return CREDENTIAL_SHAPES.some((shape) => shape.test(text)) || cardNumberIn(text);
}

/**
 * A run of digits that may be a card number: 13 to 19 digits, a single space
 * or dash allowed between them, with no digit run continuing on either side.
 */
const DIGIT_RUN = /(?<!\d)(?<!\d[ -])\d(?:[ -]?\d){12,18}(?![ -]?\d)/gu;
/** Unbroken, or in groups of four with a shorter last group, or Amex's 4-6-5 and Diners' 4-6-4. */
const CARD_GROUPING = /^(?:\d{13,19}|\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,4})?|\d{4}[ -]\d{6}[ -]\d{4,5})$/u;

/** `text` with each card number in it replaced by `marker`, and every other character as it was. */
export function automationStudioWithoutCardNumbers(text: string, marker: string): string {
  return text.replace(DIGIT_RUN, (run) => (cardNumber(run) ? marker : run));
}

function cardNumberIn(text: string): boolean {
  for (const [run] of text.matchAll(DIGIT_RUN)) if (cardNumber(run)) return true;
  return false;
}

function cardNumber(run: string): boolean {
  if (!CARD_GROUPING.test(run)) return false;
  const digits = run.replace(/[ -]/gu, "");
  return digits.length >= 13 && digits.length <= 19 && /^[2-6]/u.test(digits) && luhn(digits);
}

/** The Luhn check every payment card number passes. */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Whether a key is Core's own vocabulary for something a model could execute
 * or address directly: the `target` family, which is what a repair addresses in
 * every domain.
 *
 * Core denies these itself, wherever a projection of a run reaches a request.
 * A medium's own word for a target -- `selector` in a browser -- is not here
 * and never was Core's to name: it is the bound domain's declaration, checked
 * beside this.
 *
 * It lives here rather than beside its first caller because it now has two:
 * the reusable-context screen in `context-packet.ts` and the repair context's
 * parameter projection. The list this file replaced was written out twice
 * once before, in the packet and in the provider, and the copies drifted.
 */
export function automationStudioExecutableTargetKey(key: string): boolean {
  return /^(?:target|targets|targetid|targetids|targetnodeid|targetnodeids|actiontarget|actiontargets)$/u
    .test(key.toLowerCase().replace(/[^a-z0-9]/gu, ""));
}
