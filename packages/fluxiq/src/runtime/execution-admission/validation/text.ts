export function executionText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.includes(String.fromCharCode(0))) {
    throw new Error(`execution_admission.invalid_${label}`);
  }
  return value;
}
