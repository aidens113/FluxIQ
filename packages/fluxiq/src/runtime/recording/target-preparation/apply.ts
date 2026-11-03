import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";
import type { RecordingEntryTargetPreparerBinding } from "./binding.ts";

/** Applies only domain-owned data fields; entry identity and executable routing stay original. */
export function prepareRecordingEntryTargets(entries: readonly AppendRecordingEntryInput[], domainId: string | null | undefined, binding?: RecordingEntryTargetPreparerBinding): AppendRecordingEntryInput[] {
  if (!domainId || !binding) return [...entries];
  const { callback, receiver } = binding;
  return entries.map(entry => {
    if (entry.type !== "action") return entry;
    const original = Object.getOwnPropertyDescriptors(entry);
    const prototype = Object.getPrototypeOf(entry);
    const projected = callback.call(receiver, domainId, entry);
    const current = Object.getOwnPropertyDescriptors(entry);
    if (Object.getPrototypeOf(entry) !== prototype || Reflect.ownKeys(original).length !== Reflect.ownKeys(current).length
      || Reflect.ownKeys(original).some(key => !sameDescriptor(Reflect.get(original, key), Reflect.get(current, key)))) throw new Error("recording.target_preparation.entry_changed");
    if (projected === null) return entry;
    if (typeof projected !== "object" || Array.isArray(projected)) throw new Error("recording.target_preparation.invalid_projection");
    const parameters = Object.getOwnPropertyDescriptor(projected, "parameters");
    const target = Object.getOwnPropertyDescriptor(projected, "target");
    if (!parameters || !("value" in parameters) || !parameters.value || typeof parameters.value !== "object" || Array.isArray(parameters.value)) throw new Error("recording.target_preparation.invalid_parameters");
    if (target && !("value" in target)) throw new Error("recording.target_preparation.invalid_target");
    return { ...entry, parameters: parameters.value, ...(target ? { target: target.value } : {}) };
  });
}

function sameDescriptor(original: PropertyDescriptor, current: PropertyDescriptor | undefined): boolean {
  return current !== undefined && original.value === current.value && original.get === current.get && original.set === current.set
    && original.writable === current.writable && original.configurable === current.configurable && original.enumerable === current.enumerable;
}
