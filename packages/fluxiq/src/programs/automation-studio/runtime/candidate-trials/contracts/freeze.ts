export function freezeCandidateTrialValue<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) freezeCandidateTrialValue(entry);
    Object.freeze(value);
  }
  return value;
}
