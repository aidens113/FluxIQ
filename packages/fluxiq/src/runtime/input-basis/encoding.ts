import { isProxy } from "node:util/types";
import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { AutomationStudioInputHead, AutomationStudioInputSnapshotReference, AutomationStudioInputState, AutomationStudioInputProducer, AutomationStudioInputRevision, AutomationStudioInputScope } from "./contracts/index.ts";

/** Strict data snapshots: no getters, proxies, serialization hooks or silently dropped JSON members. */
export class AutomationStudioInputBasisEncoding {
  static scope(value: unknown): AutomationStudioInputScope | undefined {
    const row = data(value, ["projectId", "taskId", "principalId", "producerId"]);
    if (!row || !identifier(row.projectId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(row.projectId)
      || !identifier(row.taskId) || !identifier(row.principalId) || !identifier(row.producerId)) return undefined;
    return Object.freeze({ projectId: row.projectId, taskId: row.taskId, principalId: row.principalId, producerId: row.producerId });
  }

  static reference(value: unknown): AutomationStudioInputRevision | undefined {
    const row = data(value, ["ownerId", "bindingId", "revision"]);
    if (!row || !identifier(row.ownerId) || !identifier(row.bindingId) || typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 1) return undefined;
    return Object.freeze({ ownerId: row.ownerId, bindingId: row.bindingId, revision: row.revision });
  }

  static producers(value: unknown): readonly AutomationStudioInputProducer[] | undefined {
    if (!Array.isArray(value) || isProxy(value) || !dense(value)) return undefined;
    const result: AutomationStudioInputProducer[] = [];
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)).slice(0, value.length)) {
      const row = data(descriptor.value, ["role", "reference"]);
      const reference = row && this.reference(row.reference);
      if (!row || !reference || row.role !== "inherited" && row.role !== "defaults" && row.role !== "caller" && row.role !== "binding") return undefined;
      result.push(Object.freeze({ role: row.role, reference }));
    }
    return Object.freeze(result);
  }

  static values(value: unknown): { status: "valid"; value: JsonObject } | { status: "invalid" } {
    try {
      const copied = json(value, new Set());
      return copied !== null && typeof copied === "object" && !Array.isArray(copied) ? { status: "valid", value: copied } : { status: "invalid" };
    } catch { return { status: "invalid" }; }
  }

  static snapshot(value: unknown): AutomationStudioInputSnapshotReference | undefined {
    const row = data(value, ["snapshotId", "occurrenceId", "count"]);
    return row && identifier(row.snapshotId) && identifier(row.occurrenceId) && row.count === 1
      ? Object.freeze({ snapshotId: row.snapshotId, occurrenceId: row.occurrenceId, count: 1 }) : undefined;
  }

  static head(value: unknown): AutomationStudioInputHead | undefined {
    const row = data(value, ["reference", "snapshot", "producers"]);
    const reference = row && this.reference(row.reference), snapshot = row && this.snapshot(row.snapshot), producers = row && this.producers(row.producers);
    return reference && snapshot && producers ? Object.freeze({ reference, snapshot, producers }) : undefined;
  }

  static state(value: unknown): AutomationStudioInputState | undefined {
    const row = data(value, ["ownerId"], ["head"]);
    if (!row || !identifier(row.ownerId)) return undefined;
    if (!Object.hasOwn(row, "head")) return Object.freeze({ ownerId: row.ownerId });
    const head = this.head(row.head);
    return head && head.reference.ownerId === row.ownerId ? Object.freeze({ ownerId: row.ownerId, head }) : undefined;
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function data(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== "string" || !keys.includes(key) && !optional.includes(key)) || keys.some(key => !Object.hasOwn(descriptors, key))) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of own) {
    const descriptor = descriptors[String(key)]!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return undefined;
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
  }
  return result;
}

function dense(value: readonly unknown[]): boolean {
  if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return false;
  }
  return true;
}

function json(value: unknown, active: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (!value || typeof value !== "object" || isProxy(value) || active.has(value)) throw new Error("input_basis.unsupported_input");
  active.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (!dense(value)) throw new Error("input_basis.unsupported_input");
      const result = Array.from({ length: value.length }, (_, index) => json(descriptors[index]!.value, active));
      Object.freeze(result);
      return result;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("input_basis.unsupported_input");
    const result: JsonObject = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = typeof key === "string" ? descriptors[key] : undefined;
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error("input_basis.unsupported_input");
      Object.defineProperty(result, key, { value: json(descriptor.value, active), enumerable: true });
    }
    return Object.freeze(result);
  } finally { active.delete(value); }
}
