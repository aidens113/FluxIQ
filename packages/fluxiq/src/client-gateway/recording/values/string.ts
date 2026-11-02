export function stringMetadataValue(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const value = Reflect.get(metadata, key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
