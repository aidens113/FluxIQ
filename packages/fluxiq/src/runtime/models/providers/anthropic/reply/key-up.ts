import { isRecord } from "../../../transport/index.ts";

/**
 * A reply with a misplaced key moved up one level, where the schema and the reply make the mistake unambiguous. Run
 * `run-mw48myz5` step 34 sent a clear verdict with `confidence` inside `diagnosis`, where only the top level takes it.
 *
 * A key moves only when the object it sits in is closed and does not take it, the object above it does take it, and that
 * object does not already have it. A key present in both places is a real disagreement and stays refused. Nothing is added
 * or invented: the key and its value are the model's own, and the reply is still validated by the caller. This returns the
 * reply itself where it does not apply.
 */
export function automationStudioAnthropicReplyKeyUp(value: unknown, schema: unknown): unknown {
  if (!isRecord(value) || !isRecord(schema) || !isRecord(schema.properties)) return value;
  const properties = schema.properties;
  let repaired: Record<string, unknown> | undefined;
  for (const [name, child] of Object.entries(value)) {
    const childSchema = properties[name];
    if (!isRecord(child) || !isRecord(childSchema) || childSchema.additionalProperties !== false || !isRecord(childSchema.properties)) continue;
    for (const key of Object.keys(child)) {
      const current = repaired ?? value;
      if (key in childSchema.properties || !(key in properties) || key in current) continue;
      const { [key]: moved, ...rest } = current[name] as Record<string, unknown>;
      repaired = { ...current, [key]: moved, [name]: rest };
    }
  }
  return repaired ?? value;
}
