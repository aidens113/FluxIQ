import { executionPropertyDescriptor } from "../execution-observation/index.ts";
import { isProxy } from "node:util/types";

/** Factory facts can only deny changed delegates, never grant execution/completion credit. */
export class AutomationStudioEnvironmentClockBindings {
  static readonly #delegates = new WeakMap<object, { readonly receiver: object; readonly key: PropertyKey; readonly value: unknown; readonly data: boolean; readonly optional: boolean }>();

  static bind(wrapper: object, receiver: object, key: PropertyKey, optional = false): void {
    if (this.#delegates.has(wrapper)) throw new Error("environment.clock_binding_already_bound");
    const proxy = isProxy(receiver);
    const descriptor = proxy ? undefined : executionPropertyDescriptor(receiver, key);
    this.#delegates.set(wrapper, Object.freeze({ receiver, key, value: descriptor?.value, data: !proxy && (descriptor === undefined || "value" in descriptor), optional }));
  }

  static assert(wrapper: unknown): void {
    if (wrapper === null || typeof wrapper !== "function" && typeof wrapper !== "object") return;
    const original = this.#delegates.get(wrapper);
    if (!original) return;
    if (!original.data) throw new Error("environment.clock_delegate_unavailable");
    const current = executionPropertyDescriptor(original.receiver, original.key);
    const data = current === undefined || "value" in current;
    if (!original.data || !data || current?.value !== original.value || typeof original.value !== "function" && !(original.optional && original.value === undefined)) throw new Error("environment.clock_delegate_unavailable");
  }
}
