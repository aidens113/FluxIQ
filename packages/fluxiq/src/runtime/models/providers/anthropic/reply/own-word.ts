import { isRecord } from "../../../transport/index.ts";
import { automationStudioAnthropicSchemaMisses } from "../schema-misses.ts";

/**
 * A reply with its outer word put right, where the word is one the model cannot choose and the rest of the reply makes
 * the mistake unambiguous. Run `run-mw3itjcy-ce4429f7` step 67 sent a sound decision under the word of its own inner
 * object, `{ kind: "amend_draft", summary, decision: { kind: "amend_draft", amendments } }`, where the schema's outer
 * `kind` can only be `evidence_tool_decision`.
 *
 * It adds nothing to the answer, as `./json.ts`'s repairs do not, so it is repaired only this narrowly: the schema fixes
 * the word as a const, the word the reply wrote there is the same word an object inside it carries under the same key, and
 * that object fits its place in the schema. A word naming some other answer is not this, and stays refused. The reply is
 * still validated by the caller, and a decision goes on to the harness as any other, so a repair can never make an invalid
 * answer valid. Only the word changes, and this returns the reply itself where it does not apply.
 */
export function automationStudioAnthropicReplyOwnWord(value: unknown, schema: unknown): unknown {
  if (!isRecord(value) || !isRecord(schema) || !isRecord(schema.properties)) return value;
  const properties = schema.properties;
  let repaired: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(properties)) {
    if (!isRecord(child) || typeof child.const !== "string" || typeof value[key] !== "string" || value[key] === child.const) continue;
    const word = value[key];
    const wrapped = Object.entries(value).find(([, item]) => isRecord(item) && item[key] === word);
    if (!wrapped || automationStudioAnthropicSchemaMisses(wrapped[1], properties[wrapped[0]], { root: schema, lengths: false }).length > 0) continue;
    repaired = { ...(repaired ?? value), [key]: child.const };
  }
  return repaired ?? value;
}
