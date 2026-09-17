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
  return CREDENTIAL_SHAPES.some((shape) => shape.test(text));
}
