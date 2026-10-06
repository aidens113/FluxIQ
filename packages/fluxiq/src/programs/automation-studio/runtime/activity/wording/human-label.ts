/**
 * `text` as a person may read it, or nothing when it is not a person's words.
 *
 * An authored label ("Open search") is shown as written, with its whitespace
 * collapsed and any quotes around it removed, so a caller can put it in quotes
 * of its own without doubling them. Something that reads as an id -- no space
 * and a dot in it, such as `node.bootstrap.a.b` or `web.output.dom-click` -- is
 * not a label, whatever field it was found in, and neither is an empty string.
 * `max` bounds what is kept, cut with an ellipsis at the end of a word where
 * one ends in the second half of what is kept: a cut inside a word put
 * "Earbuds, Hybr…" on a card and in the chat (U-2, `run-muw60j7c-bb7c9a62`).
 */
export function automationStudioActivityHumanLabel(text: unknown, max = 80): string | undefined {
  if (typeof text !== "string") return undefined;
  const collapsed = text.replace(/\s+/gu, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim();
  if (!collapsed || (!collapsed.includes(" ") && collapsed.includes("."))) return undefined;
  if (collapsed.length <= max) return collapsed;
  const kept = collapsed.slice(0, max - 1);
  const space = collapsed.charAt(max - 1) === " " ? max - 1 : kept.lastIndexOf(" ");
  const cut = space >= max / 2 ? kept.slice(0, space) : kept;
  return `${cut.trimEnd().replace(/[,;:]+$/u, "")}…`;
}
