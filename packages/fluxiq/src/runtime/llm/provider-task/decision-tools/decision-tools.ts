// An evidence decision's schema as one provider tool per decision variant (D12, t1038).
//
// **Why.** The decision was a JSON object inside a JSON string: Anthropic's grammar cannot hold the decision schema
// (`decision.oneOf`: `complete`, `amend_draft`, one `tool_call` per offered tool with its `toolId` a constant), so the
// adapter asked for `{ result_json: "<the decision as text>" }` and the model wrote every quote of the decision escaped.
// 25 of the 463 decisions the bigbox runs of 2026-11-24 recorded could not be read. A tool call is the provider's own
// shape for "one of these, with this input": each variant becomes a tool, and the model's choice of tool is the variant.
//
// **What each tool is.** Its input is the variant without its constants -- `kind`, and `toolId` for a tool call, which
// the tool's name stands for -- with the wrapper's `summary` first, so the summary is written before the decision. A
// tool call's `input` stays nested as it is in the schema: a tool's own input keys may be named like the call's own
// (`add`, `act`, `place`, `callId`), and flattening them into one object would make the two collide.
//
// **Deterministic.** Built from the schema alone, in its order, every key copied in its order: two requests offering the
// same decisions get byte-identical tools, which providers render first in their cached prefix.
//
// **Nothing relaxed.** The tools carry the variants' constraints as the schema gives them; a provider adapter may relax
// them for its grammar, and Core checks the decision read back against the unchanged original schema either way.

import { isRecord } from "../../provider-transport/index.ts";
import { automationStudioLlmDecisionToolName } from "./tool-name.ts";
import type { AutomationStudioLlmDecisionTool, AutomationStudioLlmDecisionTools, AutomationStudioLlmDecisionToolVariant } from "./types.ts";

/** The keys a variant holds as constants, which the tool's name stands for. */
const CONSTANT_KEYS: ReadonlySet<string> = new Set(["kind", "toolId"]);
/** A variant's own members carried onto its tool's input schema, besides its properties and required. */
const VARIANT_SCHEMA_KEYS = ["type", "additionalProperties"] as const;

/**
 * The tools an evidence decision schema offers (header), or `undefined` where the schema is not one this can express
 * whole: no `decision.oneOf`, or a variant without a constant `kind` (a tool call also needs its constant `toolId`).
 * A caller then keeps the transport it had.
 */
export function automationStudioLlmDecisionTools(outputSchema: unknown): AutomationStudioLlmDecisionTools | undefined {
  if (!isRecord(outputSchema) || !isRecord(outputSchema.properties)) return undefined;
  const { kind, summary, decision } = outputSchema.properties;
  const wrapperKind = isRecord(kind) ? kind.const : undefined;
  if (typeof wrapperKind !== "string" || !isRecord(decision) || !Array.isArray(decision.oneOf) || decision.oneOf.length === 0) return undefined;
  const taken = new Set<string>();
  const tools: AutomationStudioLlmDecisionTool[] = [];
  for (const variant of decision.oneOf) {
    const tool = variantTool(variant, summary, taken);
    if (!tool) return undefined;
    tools.push(tool);
  }
  return { tools, wrapperKind };
}

function variantTool(variant: unknown, summary: unknown, taken: Set<string>): AutomationStudioLlmDecisionTool | undefined {
  if (!isRecord(variant) || !isRecord(variant.properties)) return undefined;
  const kind = constantOf(variant.properties.kind);
  if (typeof kind !== "string") return undefined;
  const toolId = constantOf(variant.properties.toolId);
  if (kind === "tool_call" && typeof toolId !== "string") return undefined;
  const which: AutomationStudioLlmDecisionToolVariant = typeof toolId === "string" ? { kind, toolId } : { kind };
  const properties: Record<string, unknown> = summary === undefined ? {} : { summary };
  for (const [key, property] of Object.entries(variant.properties)) if (!CONSTANT_KEYS.has(key)) properties[key] = property;
  const required = [...(summary === undefined ? [] : ["summary"]), ...(Array.isArray(variant.required) ? variant.required.filter((key): key is string => typeof key === "string" && !CONSTANT_KEYS.has(key)) : [])];
  const inputSchema: Record<string, unknown> = { type: "object" };
  for (const key of VARIANT_SCHEMA_KEYS) if (variant[key] !== undefined) inputSchema[key] = variant[key];
  inputSchema.properties = properties;
  inputSchema.required = required;
  return { name: automationStudioLlmDecisionToolName(which, taken), description: descriptionOf(which, variant.description), inputSchema, variant: which };
}

function constantOf(property: unknown): unknown {
  return isRecord(property) ? property.const : undefined;
}

/**
 * What the tool is, in words no task owns: the offered tool or decision it stands for, then the variant's own
 * description. Short on purpose: every tool is sent on every decision, the tool's own description is in the user
 * message, and what `summary` is the system prompt says once.
 */
function descriptionOf(variant: AutomationStudioLlmDecisionToolVariant, own: unknown): string {
  const said = variant.kind === "tool_call"
    ? `Calls the offered tool ${variant.toolId} (evidenceLoop.tools describes it); its input goes in input.`
    : variant.kind === "complete" ? "Finishes the task with its result."
      : variant.kind === "amend_draft" ? "Changes the Flow draft by the amendments given."
        : `Decides ${variant.kind}.`;
  return [said, typeof own === "string" && own.trim() ? own : undefined].filter(Boolean).join(" ");
}
