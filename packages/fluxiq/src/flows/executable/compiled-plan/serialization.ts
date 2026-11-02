export function serializeAutomationStudioCompiledPlanValue(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(serializeAutomationStudioCompiledPlanValue).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serializeAutomationStudioCompiledPlanValue(record[key])}`).join(",")}}`;
}
