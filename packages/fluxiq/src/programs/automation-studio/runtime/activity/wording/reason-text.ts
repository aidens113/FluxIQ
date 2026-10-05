// Activity must not import the `llm` tree at runtime: the harness is imported,
// through the service, by everything that imports activity, so reaching into
// it from here is an import cycle that leaves the service's harness undefined.
// The shapes below are therefore this module's own, and deliberately broader
// than the evidence screen's (`llm/harness/evidence-screen.ts`): a reason that
// loses a product code to "…" still reads, and one that shows a key does not.

/** A run of token characters this long: a candidate key, token or id. */
const TOKEN_RUN = /[A-Za-z0-9+/_=-]{20,}/gu;
/** Text that carries a private key is withheld whole rather than trimmed. */
const PRIVATE_KEY = /PRIVATE KEY/u;

/** A run is hidden when it holds both a letter and a digit, or is 32 characters or longer. */
function hidden(run: string): string {
  return run.length >= 32 || (/[0-9]/u.test(run) && /[A-Za-z]/u.test(run)) ? "…" : run;
}

// Names the model was shown and the person never is (U4, live run
// `run-musp39u8-9ac026ab`, moments 6, 33 and 35: "extraction.4", "extract_list",
// "the search step (step 7)" beside the panel's own "Step 5 of 5").
/** A handle: an element's (`t12`, `d7`, `e3`) or a numbered one (`extraction.4`, `explored.2:…`), with quotes around it. */
const HANDLE = /[`'"]?\b(?:[a-z]+\.\d+(?::[A-Za-z0-9_.:-]+)?|[tde]\d{1,6})\b[`'"]?/gu;
/** A namespaced node or tool id (`web.output.dom-extract`, `core.run_node`, `builtin.control.merge`). */
const NODE_ID = /\b(?:web|core|builtin|domain)\.[a-z0-9_.-]*[a-z0-9]/gu;
/** A snake_case name (`extract_list`, `amend_draft`). */
const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu;
/** The draft's own step numbers in parentheses: "(step 7)", "(steps 3 and 4)". */
const STEP_REF = /\s*\(\s*steps?\s+\d+(?:\s*(?:,|and|to|-)\s*\d+)*\s*\)/giu;
/** Parentheses a screened name left empty. */
const EMPTY_PARENS = /\s*\(\s*[,;]?\s*\)/gu;

/**
 * The model's words without the names it was shown: a handle is left out, a
 * node id is said by its last word ("dom extract"), a snake_case name as its
 * words ("extract list"), and a parenthesised draft step number is left out.
 * A word holding "/" or "@" -- an address -- is left whole.
 */
function screened(text: string): string {
  const words = text.replace(/\S+/gu, (word) => /[/@]/u.test(word)
    ? word
    : word
      .replace(NODE_ID, (id) => (id.split(".").at(-1) ?? id).replace(/[-_]+/gu, " "))
      .replace(HANDLE, "")
      .replace(SNAKE, (name) => name.replace(/_+/gu, " ")));
  return words.replace(STEP_REF, "").replace(EMPTY_PARENS, "").replace(/\s+([,.;:!?])/gu, "$1");
}

/**
 * A word of a code or an id ("tool_call", "core.run_node", "a1.colour"):
 * letters and digits joined by `_ . : -`, with no closing punctuation.
 */
const CODE_WORD = /^[A-Za-z0-9]+(?:[_.:-][A-Za-z0-9]+)*$/u;

/**
 * True for text made only of codes and ids, at least one of them joined by
 * `_` or `.`: no person's words at all. A decision the model sent without its
 * line is given one by Core from the decision (`../../llm/evidence-loop-decision.ts`,
 * "tool_call core.run_node"), which the chat showed as its reason (t174-w111
 * D15, `run-musq0b1m-0472cfa0`).
 */
function onlyCodes(text: string): boolean {
  const words = text.split(" ");
  return words.every((word) => CODE_WORD.test(word)) && words.some((word) => /[_.]/u.test(word));
}

/**
 * An act id the model names ("a1", "act a1.colour", and a page handle such as
 * "t985", which has the same shape): a lower-case letter, then digits.
 */
const ACT_ID = /\b(?:acts?\s+)?[a-z]\d+(?:\.[\w-]+)?\b/u;
/**
 * The draft's own mechanics, which a person cannot act on: acts, the draft,
 * amending it, a step's number, a step that would not repeat, a
 * rerun, retest, replay or dry run, and "completing with/the draft".
 */
const MECHANICS = /\b(?:acts?|draft|amend\w*|unreproducible|re-?runs?|re-?running|re-?test\w*|replay\w*|dry[- ]runs?|tool_call|steps?\s+\d+|complet(?:e|es|ed|ing)\s+(?:with|the\s+(?:draft|build|flow|task|run)))\b/iu;

/** The sentences of `text` that name neither an act id nor the draft's mechanics, rejoined. */
function withoutMechanics(text: string): string {
  return text.split(/(?<=[.!?;])\s+/u).filter((sentence) => !ACT_ID.test(sentence) && !MECHANICS.test(sentence)).join(" ");
}

/**
 * A model's own sentence as the chat may show it, or nothing when there is
 * nothing it may show.
 *
 * Text naming a private key is withheld whole. Otherwise the names the model
 * was shown and the person never is -- handles, node ids, snake_case names,
 * parenthesised draft step numbers -- are screened (`screened`, t194-w80 U4),
 * any run shaped like a token or key (20 or more letters, digits and token punctuation with no
 * space, holding both a letter and a digit, or 32 or more of them) is replaced
 * by "…", whitespace is collapsed, and the text is held to `max` characters,
 * cut with an ellipsis. Text that is only codes and ids is nothing. The words
 * are otherwise the model's: its stated reason for what it does, shown to the
 * person whose page and request it is about.
 *
 * A decision's reason (`decision`, read by `../observer.ts`) also loses each
 * sentence that names an act id or the draft's mechanics ("That completes act
 * a1.", "All acts are done and steps are in the draft."): the model's account
 * of its bookkeeping, which reached the chat under "Checking the Flow is
 * finished" and the draft's edits (t174-w111 D3, `run-musq0b1m-0472cfa0`). A
 * reason left with no sentence is nothing, and the chat shows the action alone.
 * Other text -- a result check's verdict -- is not screened this way. Both
 * that screen and the codes-only test read the model's words as written, before
 * its names are screened: a reason of codes alone ("tool_call core.run_node")
 * would otherwise read as words ("tool call run node").
 */
export function automationStudioActivityReasonText(text: unknown, max = 240, screen: { decision?: boolean } = {}): string | undefined {
  if (typeof text !== "string" || PRIVATE_KEY.test(text)) return undefined;
  const collapsed = text.replace(TOKEN_RUN, hidden).replace(/\s+/gu, " ").trim();
  const kept = screen.decision ? withoutMechanics(collapsed) : collapsed;
  if (!kept || onlyCodes(kept)) return undefined;
  const shown = screened(kept).replace(/\s+/gu, " ").trim();
  if (!shown) return undefined;
  return shown.length <= max ? shown : `${shown.slice(0, max - 1).trimEnd()}…`;
}
