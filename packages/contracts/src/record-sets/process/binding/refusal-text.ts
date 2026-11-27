// A refused processing declaration in words (t1070), as `core.set_result_processing` and the automatic data stage
// answer it: the issue codes, each refused part with its field, operator and why (the parser's `refusals`), and each
// reference no field could be bound to with why and the fields the rows hold. Run `run-mwyg0x66-4d561a42` was
// answered the codes alone fourteen times and could not tell what to correct. Every sentence quotes field ids, keys
// and Core's rules only, never a value compared or a pattern.

import type { AutomationStudioRecordSchema } from "../../schema.ts";
import type { AutomationStudioRecordProcessingRefusal } from "../types.ts";

/** What a refused declaration carries: its codes, the parser's per-part refusals, and the references left unbound. */
export type AutomationStudioRecordProcessingRefused = {
  issues: readonly string[];
  refusals?: readonly AutomationStudioRecordProcessingRefusal[] | undefined;
  unresolved?: readonly { field: string; reason: "missing" | "ambiguous" | "excluded" }[] | undefined;
};

/** A field name a sentence may quote: identifier characters only. */
const NAMEABLE = /^[A-Za-z0-9_.$@-]{1,64}$/u;

const UNRESOLVED_SAID: Record<"missing" | "ambiguous" | "excluded", string> = {
  missing: "is neither a field id nor a field label the rows hold",
  ambiguous: "is the label of more than one field the rows hold; name the one meant by its id",
  excluded: "is a field marked handling exclude, so it is never stored and cannot be read"
};

/** The refusal as one text (header); `schema`, where given, lists the fields the rows hold after an unbound reference. */
export function automationStudioRecordProcessingRefusalText(refused: AutomationStudioRecordProcessingRefused, schema?: AutomationStudioRecordSchema): string {
  const parts = (refused.refusals ?? []).map((refusal) => refusal.said);
  const unresolved = (refused.unresolved ?? []).map(({ field, reason }) => `${NAMEABLE.test(field) ? JSON.stringify(field) : "A field name that is not an identifier"} ${UNRESOLVED_SAID[reason]}.`);
  const held = unresolved.length && schema
    ? [`The rows hold ${schema.fields.filter((field) => field.handling !== "exclude").map((field) => JSON.stringify(field.id)).join(", ") || "no stored field"}.`]
    : [];
  return [`${refused.issues.join(", ")}.`, ...parts, ...unresolved, ...held].join(" ");
}
