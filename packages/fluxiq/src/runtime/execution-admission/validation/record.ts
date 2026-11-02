export function executionRecord(value: unknown, allowed: readonly string[], required: readonly string[], label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`execution_admission.invalid_${label}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key))) {
    throw new Error(`execution_admission.invalid_${label}`);
  }
  for (const key of Object.keys(descriptors)) {
    if (!("value" in descriptors[key]!)) throw new Error(`execution_admission.invalid_${label}`);
  }
  if (required.some(key => !Object.hasOwn(descriptors, key))) throw new Error(`execution_admission.invalid_${label}`);
  return value as Readonly<Record<string, unknown>>;
}
