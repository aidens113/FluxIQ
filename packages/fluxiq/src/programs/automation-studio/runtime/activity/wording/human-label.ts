/**
 * A class name a styling library writes ("css-0732x7m", "sc-AxjAm",
 * "jsx-2849671"): its library's prefix, a dash, then the rest.
 */
const LIBRARY_CLASS = /^(?:css|sc|jsx|jss|emotion|styled|svelte|tw)-[A-Za-z0-9_-]+$/u;
/** A class written as block and element or modifier ("nav__item", "btn--primary"). */
const BEM_CLASS = /[A-Za-z0-9](?:__|--)[A-Za-z0-9]/u;
/** Letters and digits run together in one part of a token at least this long, as a generated hash is ("0732x7m"). */
const MIN_HASH_PART = 5;

/**
 * True for one word that is a class name or a token a page generated rather
 * than a person's words: a styling library's class, a block-and-element
 * class, a dash- or underscore-joined token one of whose parts mixes letters
 * and digits at length ("x-0732x7m"), or letters and digits switching three
 * times or more ("x7f3k9q2"). A wordless icon control's class read
 * "Reading the details of “css-0732x7m”" (t753). "7-in-1", "USB-C", "4K60"
 * and "SKU-12345" are kept.
 */
function generated(word: string): boolean {
  if (LIBRARY_CLASS.test(word) || BEM_CLASS.test(word)) return true;
  const parts = word.split(/[-_]+/u);
  const mixed = (part: string): boolean => /\p{L}/u.test(part) && /\d/u.test(part);
  if (parts.length > 1 && parts.some((part) => part.length >= MIN_HASH_PART && mixed(part))) return true;
  return (word.match(/\p{L}+|\d+/gu)?.length ?? 0) >= 4 && /^[\p{L}\d]+$/u.test(word);
}

/**
 * `text` as a person may read it, or nothing when it is not a person's words.
 *
 * An authored label ("Open search") is shown as written, with its whitespace
 * collapsed and any quotes around it removed, so a caller can put it in quotes
 * of its own without doubling them. Something that reads as an id -- no space
 * and a dot in it, such as `node.bootstrap.a.b` or `web.output.dom-click` -- is
 * not a label, whatever field it was found in, and neither is a class name or
 * a generated token (`generated`), nor an empty string.
 * `max` bounds what is kept, cut with an ellipsis at the end of a word where
 * one ends in the second half of what is kept: a cut inside a word put
 * "Earbuds, Hybr…" on a card and in the chat (U-2, `run-muw60j7c-bb7c9a62`).
 */
export function automationStudioActivityHumanLabel(text: unknown, max = 80): string | undefined {
  if (typeof text !== "string") return undefined;
  const collapsed = text.replace(/\s+/gu, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim();
  if (!collapsed || (!collapsed.includes(" ") && (collapsed.includes(".") || generated(collapsed)))) return undefined;
  if (collapsed.length <= max) return collapsed;
  const kept = collapsed.slice(0, max - 1);
  const space = collapsed.charAt(max - 1) === " " ? max - 1 : kept.lastIndexOf(" ");
  const cut = space >= max / 2 ? kept.slice(0, space) : kept;
  return `${cut.trimEnd().replace(/[,;:]+$/u, "")}…`;
}
