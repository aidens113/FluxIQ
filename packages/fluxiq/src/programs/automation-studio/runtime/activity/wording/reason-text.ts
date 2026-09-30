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

/**
 * A model's own sentence as the chat may show it, or nothing when there is
 * nothing it may show.
 *
 * Text naming a private key is withheld whole. Otherwise any run shaped like
 * a token or key (20 or more letters, digits and token punctuation with no
 * space, holding both a letter and a digit, or 32 or more of them) is replaced
 * by "…", whitespace is collapsed, and the text is held to `max` characters,
 * cut with an ellipsis. The words are otherwise the model's: its stated reason
 * for what it does, shown to the person whose page and request it is about.
 */
export function automationStudioActivityReasonText(text: unknown, max = 240): string | undefined {
  if (typeof text !== "string" || PRIVATE_KEY.test(text)) return undefined;
  const collapsed = text.replace(TOKEN_RUN, hidden).replace(/\s+/gu, " ").trim();
  if (!collapsed) return undefined;
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1).trimEnd()}…`;
}
