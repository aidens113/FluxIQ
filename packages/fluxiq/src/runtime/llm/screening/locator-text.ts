// The screen that keeps a locator out of free text on its way to the model.
//
// A locator is any string that addresses a control by the structure of what
// shows it. This system's rule is that no model is ever handed one: a repair
// addresses a control through an opaque handle the domain can resolve, never
// through a string the model wrote or copied. That rule is Core's and holds for
// every domain, because the provider pre-flight enforces it on everything that
// leaves for a provider, whatever produced it. So this screen stays here, and it
// takes no hook: it applies whether a domain is bound or not, and with nothing
// bound it screens exactly what it screens with one.
//
// Every other rule in the recovery context works on keys: a section is built
// field by field, a domain-supplied value is refused when it carries a key that
// means "page source", and the failed target is described by how resolution
// went rather than by anything that addresses an element. A key rule cannot see
// inside a sentence, and the failure record's `expected` and `actual` are
// sentences a domain wrote. Such a sentence is the most informative thing in the
// whole request -- it names the candidates that were refused and what they
// scored -- and a locator inside it is what it must not carry.
//
// So the sentence is kept and the locator inside it is not: each run of address
// notation becomes `[locator withheld]`, and the words around it stay.
//
// **The shapes below are data, and they are the one place Core names any
// domain's notation.** They are the notations this system has actually met, and
// the patterns spell their literal tokens because a pattern with no tokens would
// redact ordinary text. They are screened against and never read for meaning:
// nothing here parses a locator or acts on one.
//
// **The shapes are narrow on purpose, and the pass is fail-closed against
// them.** Ordinary text reaches this check -- node ids like `node.checkout`,
// failure codes like `web.target.selector_miss`, scores like `-0.29`, a URL, a
// path fragment -- and redacting those would cost the model the context the
// sentence exists to give it. Each shape therefore needs a structure prose does
// not have: a bracketed comparison, an attribute assertion, a path step, a
// pseudo-class, or a token that begins with `.` or `#`. After redacting, the
// result is screened again with the same shapes, and a string that still trips
// one is replaced whole rather than sent. The screen is the contract: a
// redaction can never emit something the screen would refuse, and the request
// test reads the same function, so the two cannot drift.
//
// What this does not claim is that it knows every way to address an element.
// It knows the ways this system has actually produced, and the guarantee is the
// one it can keep: no string leaving here matches a shape the screen names.
//
// It lived under `runtime/recovery/` while the recovery context was its only
// caller. It has two now -- the context builder that applies it, and the
// provider pre-flight that re-checks it hasn't drifted -- and the pre-flight is
// in `runtime/llm/`, which may not import a value out of `runtime/recovery/`
// (see `scripts/structure-audit/config.mjs`: that edge closes a module cycle).
// So it sits beside `evidence-screen.ts` and `failure-evidence.ts`, which is
// where it belonged anyway: all three are screens applied to what leaves for a
// provider, and `runtime/recovery/` importing a value out of `runtime/llm/` is
// the direction that is allowed.

import type { JsonValue } from "../../../core/index.ts";

/** What replaces a locator. Short, and obviously not something to copy. */
export const AUTOMATION_STUDIO_WITHHELD_LOCATOR = "[locator withheld]";

const LOCATOR_SHAPES: readonly RegExp[] = [
  // A bracketed comparison on a name, with or without an `@`.
  /\[\s*@?[A-Za-z_:][\w:.-]*\s*[~^$*|]?=\s*(?:"[^"]*"|'[^']*'|[^\]\s]+)\s*\]/u,
  // The same brackets with no comparison, where the name is punctuated or
  // marked as an attribute's rather than a word. A bracketed plain word is left
  // alone, because prose brackets things.
  /\[\s*@[A-Za-z_:][\w:.-]*\s*\]/u,
  /\[\s*[A-Za-z_][\w:]*[-:][\w:.-]*\s*\]/u,
  // The same assertion written without brackets.
  /\b(?:data|aria)-[\w-]+\s*=/u,
  /\b(?:id|name|class|testid)\s*=\s*(?:"[^"]*"|'[^']*'|[#.\w-]+)/u,
  // A path step. A URL's `//` follows a colon, so it is not one. A plain path
  // is deliberately not one either: `/checkout/confirm` is a page, and an
  // expected-state condition is full of those, so a path has to carry something
  // only a structural path has -- a descendant `//`, a predicate, the document
  // root, or one of its functions.
  /(?<![:\w])\/\/(?:\*|[A-Za-z_][\w.:-]*)/u,
  /(?<![:\w])\/[A-Za-z_*][\w.:-]*(?=\[)/u,
  /(?<![:\w])\/html\b/iu,
  /\b(?:text|node|position|last|local-name)\(\s*\)/u,
  // A pseudo-class or pseudo-element.
  /::?(?:nth-(?:last-)?(?:child|of-type)|first-child|last-child|only-child|first-of-type|last-of-type|before|after|not|has)\b/u,
  // A token that begins with a sigil: `.product-card`, `#confirm`.
  // The lookbehind is what keeps `0.29`, `e.g.`, `node.checkout` and
  // `web.target.selector_miss` out of it -- a full stop inside or after a word
  // does not begin a token.
  /(?<![\w.])\.[A-Za-z_][\w-]*/u,
  /(?<![\w#])#[A-Za-z_][\w-]*/u,
  // The same sigil in front of an id that does not start with a letter, which
  // is the id this product actually meets: a generated `:r13b8o:` can only be
  // addressed as `#\:r13b8o\:`, so the rule above, which requires a letter or an
  // underscore after the `#`, walked straight past the one shape this repository
  // has a task named after (t112, a Flow authored against a generated id that
  // changed under the next seed). A `#` followed by a backslash or a colon is
  // never prose.
  /(?<![\w#])#(?:\.|:)[\w:.\-]*/u,
  // A name qualified by an id: `button#confirm`. There is deliberately no rule
  // for a name qualified by a dotted word. `div.row-selected` and
  // `web.output.dom-click` have the same shape, and this system writes the
  // second everywhere -- definition ids, node ids, schema versions, prompt
  // versions, failure codes. Any rule wide enough to catch the first redacts
  // all of those, which costs the model more than the rule protects. A dotted
  // word that arrives with its dot first is caught by the rule above; one
  // written against a name is not, and saying so is better than a rule that
  // quietly eats every identifier in the request.
  /\b[A-Za-z][\w-]*#[A-Za-z_][\w-]*/u
];

/** Whether any shape the screen names appears anywhere in `text`. */
export function automationStudioLocatorShapedText(text: string): boolean {
  return LOCATOR_SHAPES.some((shape) => shape.test(text));
}

/**
 * The same value with every locator-shaped run replaced, as a copy.
 *
 * Strings only: keys are Core's own field names, and numbers and booleans
 * cannot carry one. A string that still trips the screen after redacting --
 * shapes can overlap, and one can be built out of another's leftovers -- is
 * given up whole, so the guarantee holds for text no rewrite could settle.
 */
export function automationStudioWithoutLocators<Value extends JsonValue>(value: Value): Value {
  if (typeof value === "string") return textWithoutLocators(value) as Value;
  if (Array.isArray(value)) return value.map((item) => automationStudioWithoutLocators(item)) as Value;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, automationStudioWithoutLocators(item as JsonValue)])) as Value;
  }
  return value;
}

function textWithoutLocators(text: string): string {
  if (!automationStudioLocatorShapedText(text)) return text;
  let redacted = text;
  for (const shape of LOCATOR_SHAPES) {
    redacted = redacted.replace(new RegExp(shape.source, `${shape.flags.replace("g", "")}g`), AUTOMATION_STUDIO_WITHHELD_LOCATOR);
  }
  return automationStudioLocatorShapedText(redacted) ? AUTOMATION_STUDIO_WITHHELD_LOCATOR : redacted;
}
