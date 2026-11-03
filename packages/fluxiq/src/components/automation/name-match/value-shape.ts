/**
 * What a named thing accepts, at the coarseness a model's guess can be judged
 * against. It is a tie-break signal, not a type system: `unknown` means the
 * caller does not know, and carries no signal either way.
 */
export type AutomationStudioNameValueShape = "text" | "number" | "boolean" | "list" | "record" | "unknown";
