export function safeKind(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}
