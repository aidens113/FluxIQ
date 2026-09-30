/**
 * The page a person has open, as far as a model or a sentence needs it: its
 * origin and path. The query and fragment are left out, because they are where
 * a page keeps a search, a session or a token, and neither the model nor the
 * thread needs them to know which page this is. Null for anything that is not
 * an http or https address.
 */
export function automationStudioConversationPageShown(address: string | undefined | null): string | null {
  if (!address) return null;
  let parsed: URL;
  try {
    parsed = new URL(address);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return `${parsed.origin}${parsed.pathname}`;
}
