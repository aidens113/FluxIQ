/** A secret read from stdin or a file without the newline its writer added; nothing else is trimmed. */
export function stripTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/u, "");
}
