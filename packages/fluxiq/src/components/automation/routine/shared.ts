export function referenceId(value: unknown): string {
  return String(value ?? "").trim();
}
