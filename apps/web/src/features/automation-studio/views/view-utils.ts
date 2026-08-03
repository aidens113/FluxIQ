export function formatTime(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toLocaleString() : "-";
}

export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function groupByNamespace(signals: any[]): Record<string, any[]> {
  return signals.reduce<Record<string, any[]>>((groups, signal) => {
    const namespace = signal.namespace ?? "state";
    groups[namespace] = [...(groups[namespace] ?? []), signal];
    return groups;
  }, {});
}
