// An evidence decision's tools as Anthropic's Messages API takes them (D12, t1038): `tools` and `tool_choice`.
//
// **Strict where the grammar holds it.** `strict: true` makes the API sample only input its grammar allows, so a tool
// whose input schema is wholly closed is sent strict, in its grammar form (`./grammar.ts`: a constraint the grammar
// does not enforce moves into its description). The structured-outputs page's limits are per request, across every
// strict schema -- 20 strict tools, 24 optional parameters, 16 union-typed parameters -- so tools are taken strict in the
// order offered while the next one still fits, and every other tool goes as its schema is, non-strict. Either way Core
// reads the call back and checks it against the unchanged original schema (`../../../llm/anthropic/task-answer.ts`).
//
// **The tool choice is `auto`, one call at most.** A choice that forces a call (`any`, `tool`) is a 400 on Claude
// Sonnet 5.5 and Opus 5.5 (the tool-use pages, "Forcing tool use"). Haiku 5.5 accepts it, but a judge that continues
// the decider's cached conversation (`./continuation.ts`) must send the decider's own tool choice -- changing it
// invalidates the cached messages -- and a judge answers in text, which `any` would not allow. So every model gets
// `auto` with `disable_parallel_tool_use`, and the system prompt asks for exactly one call; a reply with none is a
// paid, accounted failure (`./messages.ts`, `tool_call_missing`).
//
// **Deterministic.** Built from the tools alone, in their order: the same offer is the same bytes, and tools render
// first in the cached prefix.

import { automationStudioAnthropicGrammar, AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS } from "./grammar.ts";

/** A decision tool as this wire needs it; the provider-neutral tools (`../../../llm/provider-task/decision-tools/`) have this shape. */
export type AutomationStudioAnthropicDecisionTool = { readonly name: string; readonly description: string; readonly inputSchema: Record<string, unknown> };

/** One tool definition as sent. */
export type AutomationStudioAnthropicToolDefinition = { name: string; description: string; input_schema: Record<string, unknown>; strict?: true };

/** The two request members a decision sent as tools adds. */
export type AutomationStudioAnthropicDecisionToolsWire = {
  tools: AutomationStudioAnthropicToolDefinition[];
  tool_choice: { type: "auto"; disable_parallel_tool_use: true };
};

/** `tools` as sent (header). */
export function automationStudioAnthropicDecisionToolsWire(tools: readonly AutomationStudioAnthropicDecisionTool[]): AutomationStudioAnthropicDecisionToolsWire {
  let strict = 0;
  let optional = 0;
  let unions = 0;
  const definitions = tools.map((tool): AutomationStudioAnthropicToolDefinition => {
    const grammar = automationStudioAnthropicGrammar(tool.inputSchema, { keepOpenObjects: true });
    const fits = grammar.representable
      && strict < AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.strictTools
      && optional + grammar.optional <= AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.optional
      && unions + grammar.unions <= AUTOMATION_STUDIO_ANTHROPIC_GRAMMAR_LIMITS.unions;
    if (!fits) return { name: tool.name, description: tool.description, input_schema: tool.inputSchema };
    strict += 1;
    optional += grammar.optional;
    unions += grammar.unions;
    return { name: tool.name, description: tool.description, input_schema: grammar.schema, strict: true };
  });
  return { tools: definitions, tool_choice: { type: "auto", disable_parallel_tool_use: true } };
}
