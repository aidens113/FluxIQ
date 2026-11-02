export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
