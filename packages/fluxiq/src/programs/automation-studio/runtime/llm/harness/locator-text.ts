// The screen that keeps a locator out of free text on its way to the model.
//
// Every other rule in the recovery context works on keys: a section is built
// field by field, a domain-supplied value is refused when it carries a key that
// means "page source", and the failed target is described by how resolution
// went rather than by anything that addresses an element. A key rule cannot see
// inside a sentence, and the failure record's `expected` and `actual` are
// sentences a domain wrote. The web domain's read, verbatim:
//
//     an element matching selector [data-testid="detach-target"], visual target
//     379,116 (refused main scoring -0.29), element fingerprint (refused
//     button[data-testid="dead-link"] "Link that goes nowhere" scoring -0.29)
//
// That is the most informative thing in the whole request -- it names the
// candidates that were refused and what they scored -- and it hands the model a
// CSS selector, which is exactly what no part of this system may do: a repair
// addresses a control through an opaque handle the domain can resolve, never
// through a string the model wrote or copied.
//
// So the sentence is kept and the locator inside it is not. What comes out is
//
//     an element matching selector [locator withheld], visual target 379,116
//     (refused main scoring -0.29), element fingerprint (refused
//     button[locator withheld] "Link that goes nowhere" scoring -0.29)
//
// **The shapes are narrow on purpose, and the pass is fail-closed against
// them.** Ordinary text reaches this check -- node ids like `node.checkout`,
// failure codes like `web.target.selector_miss`, scores like `-0.29`, a URL, a
// path fragment -- and redacting those would cost the model the context the
// sentence exists to give it. Each shape therefore needs a structure prose does
// not have: a bracketed comparison, an attribute assertion, an XPath step, a
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

import type { JsonValue } from "../../../../../core/index.ts";

/** What replaces a locator. Short, and obviously not something to copy. */
export const AUTOMATION_STUDIO_WITHHELD_LOCATOR = "[locator withheld]";

const LOCATOR_SHAPES: readonly RegExp[] = [
  // A CSS attribute selector or an XPath predicate with a comparison:
  // `[data-testid="save"]`, `[@id='save']`, `[aria-label=Save]`.
  /\[\s*@?[A-Za-z_:][\w:.-]*\s*[~^$*|]?=\s*(?:"[^"]*"|'[^']*'|[^\]\s]+)\s*\]/u,
  // The same brackets with no comparison, where the name is an attribute's
  // rather than a word: `[@disabled]`, `[data-open]`, `[aria-hidden]`. A
  // bracketed plain word is left alone, because prose brackets things.
  /\[\s*@[A-Za-z_:][\w:.-]*\s*\]/u,
  /\[\s*[A-Za-z_][\w:]*[-:][\w:.-]*\s*\]/u,
  // The same assertion written without brackets: `data-testid="save"`,
  // `aria-label=Save`, `id="confirm"`.
  /\b(?:data|aria)-[\w-]+\s*=/u,
  /\b(?:id|name|class|testid)\s*=\s*(?:"[^"]*"|'[^']*'|[#.\w-]+)/u,
  // An XPath step. A URL's `//` follows a colon, so it is not one. A plain
  // path is deliberately not one either: `/checkout/confirm` is a page, and an
  // expected-state condition is full of those, so a path has to carry
  // something only XPath has -- a descendant `//`, a predicate, the document
  // root, or one of its functions.
  /(?<![:\w])\/\/(?:\*|[A-Za-z_][\w.:-]*)/u,
  /(?<![:\w])\/[A-Za-z_*][\w.:-]*(?=\[)/u,
  /(?<![:\w])\/html\b/iu,
  /\b(?:text|node|position|last|local-name)\(\s*\)/u,
  // A CSS pseudo-class or pseudo-element.
  /::?(?:nth-(?:last-)?(?:child|of-type)|first-child|last-child|only-child|first-of-type|last-of-type|before|after|not|has)\b/u,
  // A token that begins with a class or id sigil: `.product-card`, `#confirm`.
  // The lookbehind is what keeps `0.29`, `e.g.`, `node.checkout` and
  // `web.target.selector_miss` out of it -- a full stop inside or after a word
  // does not begin a token.
  /(?<![\w.])\.[A-Za-z_][\w-]*/u,
  /(?<![\w#])#[A-Za-z_][\w-]*/u,
  // A tag qualified by an id: `button#confirm`. There is deliberately no rule
  // for a tag qualified by a class. `div.row-selected` and
  // `web.output.dom-click` have the same shape, and this system writes the
  // second everywhere -- definition ids, node ids, schema versions, prompt
  // versions, failure codes. Any rule wide enough to catch the first redacts
  // all of those, which costs the model more than the rule protects. A class
  // selector that arrives with its dot is caught by the rule above; one
  // written against a tag is not, and saying so is better than a rule that
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
