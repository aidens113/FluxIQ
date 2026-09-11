// A whole number inside an inclusive range, or a thrown limit error. Shared by
// the flow LLM execution settings check and the generated-adaptation sanitiser.

export function boundedWholeNumber(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error("LLM execution limit is invalid.");
  return value as number;
}
