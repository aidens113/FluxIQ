import type { AutomationStudioResolvedControlIntent } from "./contracts.ts";

/** Omission alone is absent; a supplied companion must be closed own data. */
export function automationStudioReadResolvedControlIntent(answer: Record<string, unknown>): AutomationStudioResolvedControlIntent | undefined | false {
  try {
    const supplied = Object.getOwnPropertyDescriptor(answer, "controlIntent");
    if (!supplied) return "controlIntent" in answer ? false : undefined;
    if (!("value" in supplied)) return false;
    const value: unknown = supplied.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const fields = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (!keys.every((key) => key === "intent" || key === "responseOnly") || !Object.hasOwn(fields, "intent")) return false;
    if (!keys.every((key) => "value" in fields[key as string]!)) return false;
    const intent: unknown = fields.intent!.value;
    const response = fields.responseOnly;
    if (!response && "responseOnly" in value) return false;
    if (intent === "accept") {
      if (response && response.value !== true) return false;
      return Object.freeze({ intent, ...(response ? { responseOnly: true as const } : {}) });
    }
    if ((intent !== "dismiss" && intent !== "neutral" && intent !== "navigate") || response) return false;
    return Object.freeze({ intent });
  } catch {
    return false;
  }
}
