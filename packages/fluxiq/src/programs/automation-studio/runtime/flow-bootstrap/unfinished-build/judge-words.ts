// The judge's words as a build ending says them to the person: plain, and
// whole sentences only (t276, item 2).
//
// Live runs `run-muw60unq-591e23bd` (U4) and `run-muw6144a-e56f945d` (U9) put
// the judge's own words into the chat, sliced to a length: "No step
// select...", "the end view still shows...", "fix s13 so...", with the names
// the judge was shown and the person never is -- a page handle "(t958)", the
// draft's step ids "s8", "s11", "s13", "its where", "end view", a field name
// "mutualFriends". Every ending that quotes the judge (`./not-finished.ts`,
// `./not-doable.ts`, `./budget-exhausted.ts`, the repair heading in
// `./not-done.ts`) now says them through this one screen:
//
// - a handle or id in parentheses is left out; a step id after a noun ("the
//   confirm loop s11") is left out; any other step id is "a step", and its
//   possessive "the step's";
// - the draft's words are said as a person's: "where" (a step's condition) is
//   "condition", "end view" is "the page at the end", "node" is "step",
//   "draft" is "Flow", and a camelCase or snake_case name is said as words;
// - a sentence, or a clause between semicolons, that still holds an id or a
//   code after that is left out whole;
// - what is left is said in whole sentences up to the room given, never cut
//   inside one, and ends with its full stop. Nothing at all when not even the
//   first fits: the caller then says it in Core's own words.
//
// Not a quote: what comes back is the judge's account in plain words, which is
// why no ending puts quotation marks round it any more.

/** A step id the draft gives (`s8`, `n12`). */
const STEP_ID = /\b[sn]\d{1,5}\b/u;
/** A page handle (`t958`, `e3`, `d7`) or an act id (`a1`, `a2.quantity`). */
const HANDLE = /\b[adet]\d{1,6}(?:\.[A-Za-z][\w-]*)?\b/u;
/** A namespaced code (`result.acts_judged_undone`, `flow_bootstrap.blank_target_required`, `web.output.dom-extract`). */
const CODE = /\b(?:[a-z][a-z0-9]*_[a-z0-9_]*(?:\.[a-z0-9_-]+)+|(?:result|core|web|llm|builtin|domain|bootstrap|flow_bootstrap|llm_evidence_loop|node)\.[a-z0-9_.-]*[a-z0-9])\b/u;

/** The judge's words, screened and in whole sentences of at most `most` characters; empty when none fits or none is plain. */
export function automationStudioFlowBootstrapJudgeWordsSaid(text: string, most: number): string {
  const pieces = screened(folded(text))
    .split(/(?<=[.!?;])\s+/u)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const kept: { piece: string; index: number }[] = [];
  pieces.forEach((piece, index) => {
    if (!STEP_ID.test(piece) && !HANDLE.test(piece) && !CODE.test(piece) && /[A-Za-z]/u.test(piece)) kept.push({ piece, index });
  });
  let said = "";
  let last = -2;
  for (const { piece, index } of kept) {
    // A clause whose next clause was left out ends there, as a sentence; what follows a sentence opens one.
    const head = said && index !== last + 1 ? said.replace(/;$/u, ".") : said;
    const next = head ? `${head} ${/[.!?]["')”]*$/u.test(head) ? capitalised(piece) : piece}` : piece;
    if (sentence(next).length > most) {
      if (!said) said = opening(piece, most);
      break;
    }
    said = next;
    last = index;
  }
  return said ? sentence(said) : "";
}

/**
 * A first sentence too long for the room, said shorter but still whole: its
 * asides in parentheses left out, then, if it still does not fit, only its
 * opening clauses, up to a ", and", ", but", ", so" or ", while" that joins two
 * whole clauses. Empty when even its first clause does not fit.
 */
function opening(piece: string, most: number): string {
  const plain = piece.replace(/\s*\([^()]*\)/gu, "").replace(/\s+([,.;:!?])/gu, "$1");
  if (sentence(plain).length <= most) return plain;
  const joins = [...plain.matchAll(/,\s+(?:and|but|so|while|because|then)\s/gu)].map((join) => join.index ?? 0).filter((at) => at > 0 && at + 1 <= most);
  const at = joins.at(-1);
  return at === undefined ? "" : plain.slice(0, at);
}

/** Whitespace and control characters folded to single spaces. */
function folded(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

/** The draft's names and words said as a person's; ids and codes the rewrites cannot place are left for the sentence filter. */
function screened(text: string): string {
  return text
    // "(t958)", "(s8, s9)", "(result.acts_judged_undone)": parentheses that hold only ids or codes.
    .replace(/\s*\(([^()]*)\)/gu, (whole, inner: string) => (inner.split(/[\s,;]+/u).filter(Boolean).every((word) => idOrCode(word.replace(/^(?:and|or)$/u, ""))) ? "" : whole))
    .replace(/\b[sn]\d{1,5}'s\b/gu, "the step's")
    // "the confirm loop s11", "its read s8": the noun already names the step.
    .replace(/\b((?:[Tt]he|[Aa]n?|[Ii]ts|[Tt]his|[Tt]hat)\s+(?:[A-Za-z-]+\s+){0,2}[A-Za-z-]+)\s+[sn]\d{1,5}\b/gu, "$1")
    .replace(/(^|[.!?;:]\s+)[sn]\d{1,5}\b/gu, "$1A step")
    .replace(/\b[sn]\d{1,5}\b/gu, "a step")
    .replace(/\b(its|the|their|a|step's)\s+where(?:\s+(?:clause|condition|filter))?\b/giu, (_, owner: string) => `${owner} condition`)
    .replace(/\b(?:the\s+)?end view\b/giu, (found: string) => (/^[A-Z]/u.test(found) ? "The page at the end" : "the page at the end"))
    .replace(/\bnode(s?)\b/gu, "step$1")
    .replace(/\bdraft\b/gu, "Flow")
    .replace(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/gu, (name) => name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").toLowerCase())
    .replace(/(?<![.\w])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![.\w])/gu, (name) => name.replace(/_+/gu, " "))
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function idOrCode(word: string): boolean {
  return word === "" || new RegExp(`^(?:${STEP_ID.source}|${HANDLE.source}|${CODE.source})$`, "u").test(word);
}

function capitalised(piece: string): string {
  return piece.replace(/^([^A-Za-z]*)([a-z])/u, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

/** Ends with a full stop where it ends with no closing mark; a closing semicolon becomes one. */
function sentence(text: string): string {
  const trimmed = text.replace(/[\s,:;]+$/u, "");
  return /[.!?]["')”]*$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}
