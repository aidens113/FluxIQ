// What of an evidence decision the Anthropic adapter holds to the schema, and as what.
//
// **The adapter judged a decision by the schema variant it came nearest, before Core read it** (t1025). The decision
// schema is one variant per offered tool, each with its `toolId` as a constant, beside `complete` and `amend_draft`. A
// reply that named a tool the schema did not offer -- a look withdrawn a decision earlier, a node's id where the tool's
// goes -- fitted no variant, and the walk reported the misses of the one with the fewest: "toolId must be exactly
// core.run_flow; input.from is missing" to a model that had asked for a page search. And a reply the harness would have
// read -- `kind: "loop_decision"` on an otherwise exact call of `core.loop_decision` -- was refused here first, since the
// harness's reading came after this check. The bigbox runs of 2026-11-24 had 22 decisions of about 120k input tokens refused
// unread, 16 of them by this walk; no other provider holds a decision to this walk (`../deepseek/response-envelope.ts`).
//
// So a decision is checked here as Core reads it, against the variant it names:
//
//   - It is read first, by the one reading the harness applies too (`../decision-reading/`), against the tools the
//     decision schema offers, so the two never hold one reply to two grammars. The reply goes on to the harness as it
//     came; the harness reads it again, the same way, and says so in the step log.
//   - A tool call naming an offered tool, a `complete` or an `amend_draft` the schema offers, is held to that variant,
//     and every miss is its own: which key, which rule.
//   - A decision naming a tool or kind the schema does not offer is not this check's to word. The loop refuses it by
//     name and says what to do instead (`../evidence-loop/decision-refusal.ts`: a tool not offered, with the offered ids
//     and the one meant; `../decision-handlers/look-withdrawal.ts`: a look withdrawn; a kind not offered), and the
//     harness refuses a kind that is none of the three. Here only the wrapper is checked.
//   - A reply with no `kind` is checked with the wrapper's own word filled in, as the harness fills it: what is missing
//     is said, not the word Core writes itself.
//
// Nothing a decision may be is relaxed: every variant keeps every constraint the schema gives it, and what is passed on
// is refused downstream exactly as for every other provider.

import { isRecord } from "../provider-transport/index.ts";
import { automationStudioLlmDecisionRead, type AutomationStudioLlmDecisionReadingTool } from "../decision-reading/index.ts";
import type { JsonObject } from "../../../core/index.ts";

const WRAPPER_KIND = "evidence_tool_decision";
/** A decision this check leaves to the harness and the loop: any object. */
const LEFT_TO_THE_LOOP = { type: "object" };

/** The reply as it is checked, and the schema it is checked against: the decision as read, against the variant it names. */
export function automationStudioAnthropicDecisionCheck(answer: unknown, schema: unknown): { value: unknown; schema: unknown } {
  if (!isRecord(answer) || !isRecord(schema) || !isRecord(schema.properties)) return { value: answer, schema };
  const worded = answer.kind === undefined ? { kind: WRAPPER_KIND, ...answer } : answer;
  const variants = isRecord(schema.properties.decision) && Array.isArray(schema.properties.decision.oneOf) ? schema.properties.decision.oneOf.filter(isRecord) : undefined;
  if (!variants || !isRecord(worded.decision)) return { value: worded, schema };
  const read = automationStudioLlmDecisionRead(worded.decision, offeredTools(variants)).decision;
  const named = variantNamed(read, variants);
  return { value: { ...worded, decision: read }, schema: { ...schema, properties: { ...schema.properties, decision: named ?? LEFT_TO_THE_LOOP } } };
}

/** The tools the decision schema offers, as its tool-call variants show them. */
function offeredTools(variants: readonly Record<string, unknown>[]): AutomationStudioLlmDecisionReadingTool[] {
  return variants.flatMap((variant) => {
    const properties = isRecord(variant.properties) ? variant.properties : {};
    const toolId = isRecord(properties.toolId) ? properties.toolId.const : undefined;
    return typeof toolId === "string" && isRecord(properties.input) ? [{ toolId, inputSchema: properties.input as JsonObject }] : [];
  });
}

/** The variant the decision's own words name: its tool for a tool call, its kind otherwise; nothing when it names none offered. */
function variantNamed(decision: unknown, variants: readonly Record<string, unknown>[]): Record<string, unknown> | undefined {
  if (!isRecord(decision) || typeof decision.kind !== "string") return undefined;
  const constOf = (variant: Record<string, unknown>, key: string): unknown => {
    const properties = isRecord(variant.properties) ? variant.properties : {};
    return isRecord(properties[key]) ? (properties[key] as Record<string, unknown>).const : undefined;
  };
  return variants.find((variant) => constOf(variant, "kind") === decision.kind
    && (decision.kind !== "tool_call" || (typeof decision.toolId === "string" && constOf(variant, "toolId") === decision.toolId)));
}
