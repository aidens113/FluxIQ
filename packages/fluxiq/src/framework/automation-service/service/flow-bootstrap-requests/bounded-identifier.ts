export function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} identifier is required.`);
  const clean = value.trim();
  if (!clean || clean.length > 200 || /[\u0000-\u001f\u007f]/.test(clean)) throw new Error(`${label} identifier is invalid.`);
  return clean;
}
