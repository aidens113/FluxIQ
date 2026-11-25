// What an evidence decision is when a provider takes it as a native tool call (D12, t1038): the shapes every provider
// adapter shares. Nothing here is one provider's wire: an adapter turns `AutomationStudioLlmDecisionTool` into its own
// tool definition and hands the call it got back as `AutomationStudioLlmDecisionToolCall`.

/** Which decision a tool stands for: the decision's `kind`, and for a tool call the offered tool's id. */
export type AutomationStudioLlmDecisionToolVariant = { readonly kind: string; readonly toolId?: string };

/**
 * One decision variant as a provider tool. `name` matches both Anthropic's (`^[a-zA-Z0-9_-]{1,128}$`) and DeepSeek's
 * function-name pattern (`^[a-zA-Z0-9_-]{1,64}$`) and is read back by lookup, never by undoing a string change.
 * `inputSchema` is the variant without its constant `kind` and `toolId`, with the wrapper's `summary` first.
 */
export type AutomationStudioLlmDecisionTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly variant: AutomationStudioLlmDecisionToolVariant;
};

/** The tools one decision request offers, in the decision schema's order, and the wrapper's own word. */
export type AutomationStudioLlmDecisionTools = {
  readonly tools: readonly AutomationStudioLlmDecisionTool[];
  /** The wrapper's `kind` constant, `evidence_tool_decision`. */
  readonly wrapperKind: string;
};

/** The one tool call a provider returned: the tool's name and its input as parsed JSON. */
export type AutomationStudioLlmDecisionToolCall = { readonly name: string; readonly input: unknown };

/** A tool call read back into the wrapper the loop reads, or why it could not be. */
export type AutomationStudioLlmDecisionFromToolCallResult =
  | { readonly ok: true; readonly response: { kind: string; summary?: unknown; decision: Record<string, unknown> } }
  | { readonly ok: false; readonly reason: "unknown_tool" | "input_not_object" };
