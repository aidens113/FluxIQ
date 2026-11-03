// Core's codes left out of FluxIQ's words.
//
// A failure Core reports can carry its codes in brackets after the sentence:
// "Flow Bootstrap generation failed (flow_bootstrap.blank_target_required)
// (pre_provider_validation: flow_bootstrap.blank_target_required)". Those are
// Core's record, exact and for a person who opens it, never words a person
// reads in the chat (U1 of the run-muw60unq-591e23bd UI review). A bracket
// that holds only such codes -- with a label before them or not, one or
// several -- is left out, with the space before it; the sentence around it is
// kept as Core wrote it.
//
// A code is a dotted lowercase id with an underscore in it, or one in a
// namespace Core's codes use ("core.replay.failed", "web.action.rejected").
// An address ("shop.example.com"), a file name ("report.csv") or a number
// ("2.5") is no code, and a bracket holding words is kept whole. Inline code
// the text marks as code is not passed here (`assistant-text.ts`). Pure.

/** A dotted lowercase id. */
const DOTTED = "[a-z][a-z0-9_]*(?:\\.[a-z0-9_-]+)+";
/** One bracket of codes: an optional label ("pre_provider_validation:"), then ids separated by commas or semicolons. */
const BRACKET = new RegExp(`\\s*[([]\\s*(?:[a-z][a-z_ ]*:\\s*)?(${DOTTED}(?:\\s*[,;]\\s*${DOTTED})*)\\s*[)\\]]`, "gu");
/** The namespaces Core's codes use. */
const CODE_NAMESPACE = /^(?:web|core|llm|flow|runtime|gateway|client|server|automation|programs|replay)\./u;

/** `text` without the brackets that hold only Core's codes. */
export function withoutRawCodes(text: string): string {
  const kept = text.replace(BRACKET, (whole: string, ids: string) => (ids.split(/\s*[,;]\s*/u).every(isCode) ? "" : whole));
  // A bracket that opened the text leaves no space at its start.
  return /^\s/u.test(text) ? kept : kept.trimStart();
}

function isCode(id: string): boolean {
  return id.includes("_") || CODE_NAMESPACE.test(id);
}
