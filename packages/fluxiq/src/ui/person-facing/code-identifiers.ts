/**
 * A dotted tool or key name: lower-case segments joined by dots, with an
 * underscore in a segment (`core.submit_subflow`, `project.write_plan`) or at
 * least three segments (`web.output.dom-click`). A site's own address
 * (`example.com`, `www.example.co.uk`) has neither, or ends in a short
 * all-letter segment, and a number (`21.4`) starts with no letter.
 */
const DOTTED = /(?<![\w.-])[a-z][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)+(?![\w-])/gu;
/** Words joined by underscores (`checkout_summary`, `repeat_refused`). */
const SNAKE = /(?<![\w.])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?!\w|\.[a-z0-9])/giu;
/**
 * A camelCase identifier: two or more lower-case letters, then humps of an
 * upper-case letter followed by lower-case ones (`routerRuns`, `taskSpec`).
 * A brand written with one leading lower-case letter (`iPhone`, `eBay`) or an
 * upper-case tail (`macOS`) is not one.
 */
const CAMEL = /(?<![\w.-])[a-z]{2,}(?:[A-Z][a-z0-9]+)+(?![\w-])/gu;

function dottedIsCode(token: string): boolean {
  const segments = token.split(".");
  if (segments.some((segment) => segment.includes("_"))) return true;
  // A host name ends in a short all-letter segment (`www.example.co.uk`); a tool id does not.
  return segments.length >= 3 && !/^[a-z]{2,3}$/u.test(segments.at(-1)!);
}

/** Each code identifier `text` shows, once, as a plain reason naming it. */
export function codeIdentifierFaults(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(DOTTED)) if (dottedIsCode(match[0])) found.add(match[0]);
  // A snake_case word inside a dotted name is already named by it.
  const inDotted = [...found].join(" ");
  for (const match of text.matchAll(SNAKE)) if (!inDotted.includes(match[0])) found.add(match[0]);
  for (const match of text.matchAll(CAMEL)) found.add(match[0]);
  return [...found].map((token) => `code identifier "${token}"`);
}
