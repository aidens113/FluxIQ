// Human-readable renderings of the machine tokens and dotted state paths
// that appear in mined evidence. No state and no dependencies: the recording
// mapper on the facade shares readableTokenValue with the miner.

export function formatStatePath(namespace: string, pathValue: string): string {
  return namespace ? `${namespace}.${pathValue}` : pathValue;
}

export function readableStatePath(pathValue: string): string {
  return pathValue.split(".").filter(Boolean).map(readableTokenValue).join(" / ");
}

export function readableTokenValue(value: string): string {
  return value.replace(/[_:.-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unknown";
}

export function stateValueSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return String(value ?? "missing");
  const stateValue = value as { value?: unknown };
  if (stateValue.value === undefined) return "missing";
  if (typeof stateValue.value === "object") return JSON.stringify(stateValue.value);
  return String(stateValue.value);
}
