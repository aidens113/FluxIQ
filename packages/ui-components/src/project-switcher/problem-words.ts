/** The sentence for a failed call: the error's own message when it has one, else `fallback`. */
export function problemWords(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message === "" ? fallback : message;
}
