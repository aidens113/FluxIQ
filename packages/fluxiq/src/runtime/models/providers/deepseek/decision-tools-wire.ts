// An evidence decision's tools as DeepSeek's chat-completions API takes them (D12, t1038): `tools` and `tool_choice`.
//
// **The tool choice is `required`.** DeepSeek's API reference for `tool_choice`: "`none`, `auto`, `required`";
// "`required` means the model must call one or more tools"; a named function "forces the model to call that tool";
// "`required` and named tool choices are not supported in thinking mode; the API returns a `400` error". Core sends
// every request with `thinking: { type: "disabled" }` (`../../../llm/deepseek/request-body.ts`), so `required` is
// accepted on both configured models. A named tool is no use: the decision is which tool, so any of them may be
// called. `required` allows several calls and there is no documented switch against it, so the reader refuses more
// than one, paid and accounted (`./response-envelope.ts`, `tool_call_several`).
//
// **Not strict.** Strict mode is a beta: it needs the `/beta` base URL, every function strict, and every object closed
// with every property required (the function-calling guide), and an optional decision field cannot be. Core keeps the
// fixed endpoint and reads the call back against the unchanged original schema either way.
//
// **Deterministic.** Built from the tools alone, in their order, so the same offer is the same bytes.

/** A decision tool as this wire needs it; the provider-neutral tools (`../../../llm/provider-task/decision-tools/`) have this shape. */
export type AutomationStudioDeepSeekDecisionTool = { readonly name: string; readonly description: string; readonly inputSchema: Record<string, unknown> };

/** One tool definition as sent. */
export type AutomationStudioDeepSeekToolDefinition = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

/** The two request members a decision sent as tools adds, in the order they are written. */
export function automationStudioDeepSeekDecisionToolsWire(tools: readonly AutomationStudioDeepSeekDecisionTool[]): { tools: AutomationStudioDeepSeekToolDefinition[]; tool_choice: "required" } {
  return {
    tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
    tool_choice: "required"
  };
}
