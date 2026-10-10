// A fact's target written as a locator, `at "<locator>"`, for hand-authored
// and test Flows that have no evidence to copy a handle from (t402; the Lab's
// recovery matrix). It is read into `{ locator: "<text>" }` and carried as
// written. Core never says what a locator is: the connected host interprets
// it (the web domain reads it as a CSS selector), and nothing resolves it -- a
// handle is resolved at bootstrap, a locator is already what the host runs
// with. The model-facing script format never mentions it: the model names
// elements by handle.
//
// Since Core cannot read a locator, it refuses only what it can see: one that
// is empty or longer than the bound. Whether the host can use it is the
// host's to answer when the fact is evaluated. The locator sits inside the
// line's double quotes, so it cannot itself contain one.
// Deliberately absent from the barrel: it is how a fact reads its target
// (`./fact-condition.ts`), not what the directory offers.

/** A fact target the connected host interprets, carried as written. */
export type AutomationStudioFlowScriptFactLocator = { locator: string };

export type AutomationStudioFlowScriptFactLocatorReading =
  | { ok: true; target: AutomationStudioFlowScriptFactLocator }
  | { ok: false; reason: string };

const MAX_LENGTH = 1_000;

/** A quoted locator read as a fact's target, or the reason it cannot be. */
export function readAutomationStudioFlowScriptFactLocator(text: string): AutomationStudioFlowScriptFactLocatorReading {
  const locator = text.trim();
  if (!locator) return { ok: false, reason: "`at` takes a locator in quotes, and this one is empty: `exists at \"<locator>\"`." };
  if (locator.length > MAX_LENGTH) return { ok: false, reason: `the locator is longer than ${MAX_LENGTH} characters.` };
  return { ok: true, target: { locator } };
}
