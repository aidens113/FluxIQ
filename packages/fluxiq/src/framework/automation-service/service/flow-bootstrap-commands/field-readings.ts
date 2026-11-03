// Validating the fields a Flow Bootstrap command carries. Each refusal names
// the field, because a command that arrives malformed must not be guessed at.

export function assertExactObjectFields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported fields: ${unexpected.sort().join(", ")}`);
}

export function requiredBootstrapCommandId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`Flow Bootstrap ${label} ID is invalid.`);
  return value.trim();
}

export function requiredBootstrapDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) throw new Error("Flow Bootstrap execution digest is invalid.");
  return value.toLowerCase();
}

export function requiredBootstrapSettingsRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("Flow Bootstrap settings revision is invalid.");
  return value as number;
}
