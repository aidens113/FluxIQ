

export function normalised(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
