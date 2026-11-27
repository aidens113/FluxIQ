// The reading half of the strict answer's reshape (`./strict-answer-schema.ts`, t1087): a `null` the grammar let through reads as the
// member being absent, where the judge's unchanged schema leaves that member optional.

import { isRecord } from "../../transport/index.ts";

/** `value` with each `null` the reshape lets through taken off a member `schema` (the original) leaves optional; the value given is never changed. */
export function automationStudioAnthropicAnswerNullsAbsent(value: unknown, schema: unknown): unknown {
  if (!isRecord(schema)) return value;
  if (Array.isArray(value)) return isRecord(schema.items) ? value.map((item) => automationStudioAnthropicAnswerNullsAbsent(item, schema.items)) : value;
  if (!isRecord(value) || !isRecord(schema.properties)) return value;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const read: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) {
    if (member === null && !required.includes(key)) continue;
    read[key] = automationStudioAnthropicAnswerNullsAbsent(member, (schema.properties as Record<string, unknown>)[key]);
  }
  return read;
}
