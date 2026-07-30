export function collectionName(value: unknown): string {
  return String(value ?? "").trim();
}
