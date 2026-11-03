/** Trusted declarations must be original own data properties; registration never invokes a getter. */
export function nativeTargetPreparationData<T extends object, K extends keyof T>(original: T, key: K): T[K] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(original, key);
  if (!descriptor) {
    if (key in original) throw new Error(`Native target preparation ${String(key)} must be an own data property.`);
    return undefined;
  }
  if (!("value" in descriptor)) throw new Error(`Native target preparation ${String(key)} must be an own data property.`);
  return descriptor.value;
}
