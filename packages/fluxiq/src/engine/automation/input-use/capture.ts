import type { AutomationStudioInputRevision } from "../../../runtime/input-basis/contracts/index.ts";

/** Exact runtime-safe JSON copies. Unsupported objects are never normalized into evidence. */
export class AutomationStudioInputUseCapture {
  static object<T>(value: T, immutable = true): { status: "valid"; value: T } | { status: "invalid" } {
    try {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "invalid" };
      inspect(value, new Set());
      // Clone the original too: a Proxy may lie to descriptor inspection, but structuredClone refuses it.
      const copy = structuredClone(value);
      if (immutable) freeze(copy);
      return { status: "valid", value: copy };
    } catch {
      return { status: "invalid" };
    }
  }

  static reference(value: AutomationStudioInputRevision): AutomationStudioInputRevision | undefined {
    const copy = this.object(value);
    if (copy.status !== "valid" || Object.keys(copy.value).length !== 3) return undefined;
    const reference = copy.value;
    return identifier(reference.ownerId) && identifier(reference.bindingId) && Number.isSafeInteger(reference.revision) && reference.revision > 0 ? reference : undefined;
  }

  /** Only isolated, validated data is compared here; object key order carries no JSON value. */
  static same(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => this.same(value, right[index]));
    const a = Object.getOwnPropertyDescriptors(left), b = Object.getOwnPropertyDescriptors(right);
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && this.same(a[key]?.value, b[key]?.value));
  }
}

function inspect(value: unknown, active: Set<object>): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return;
  if (!value || typeof value !== "object" || active.has(value)) throw new Error("input_use.unsupported_input");
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) throw new Error("input_use.unsupported_input");
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  active.add(value);
  try {
    if (array && keys.length !== value.length + 1) throw new Error("input_use.unsupported_input");
    const fields = array ? Array.from({ length: value.length }, (_, index) => String(index)) : keys;
    for (const key of fields) {
      const descriptor = typeof key === "string" ? descriptors[key] : undefined;
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error("input_use.unsupported_input");
      inspect(descriptor.value, active);
    }
  } finally {
    active.delete(value);
  }
}

function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) freeze(descriptor.value);
  Object.freeze(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
