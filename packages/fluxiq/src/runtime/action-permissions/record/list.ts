

export function list(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "nothing";
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}
