/** Walks ordinary descriptors without evaluating an own or inherited accessor. */
export function automationPropertyDescriptor(receiver: object, key: PropertyKey): PropertyDescriptor | undefined {
  for (let current: object | null = receiver; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return descriptor;
  }
  return undefined;
}
