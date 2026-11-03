/** A spread reads only enumerable own fields; observed copies refuse their accessors first. */
export function assertAutomationEnumerableData(receiver: object): void {
  for (const key of Reflect.ownKeys(receiver)) {
    const descriptor = Object.getOwnPropertyDescriptor(receiver, key);
    if (descriptor?.enumerable && !("value" in descriptor)) throw new Error("execution_observation.option_copy_accessor_unsupported");
  }
}
