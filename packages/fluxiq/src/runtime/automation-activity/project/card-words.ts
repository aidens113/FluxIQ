/** A run of hex as long as a digest's. A card never shows one: the extension hides a row whose title or ref does. */
const DIGEST_LIKE = /[a-f0-9]{32,}/giu;

/**
 * Words a project card shows a person: whitespace collapsed to single spaces,
 * any digest-shaped run replaced by an ellipsis, and cut to `max` characters.
 * A digest binds the supervisor's records to each other; it means nothing to
 * the person reading the chat, and the extension hides a row that shows one.
 */
export function automationStudioProjectCardWords(text: string, max: number): string {
  const plain = text.replace(DIGEST_LIKE, "…").replace(/\s+/gu, " ").trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1)}…`;
}
