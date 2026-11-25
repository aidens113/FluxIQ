import type { AutomationStudioLlmDecisionToolVariant } from "./types.ts";

/** The shorter of the two providers' bounds (DeepSeek's 64; Anthropic takes 128). */
const MOST_NAME_LENGTH = 64;
const NOT_NAME = /[^A-Za-z0-9_-]/gu;

/**
 * A provider tool name for a decision variant, unique among `taken`, which it joins: a tool call is named for its
 * tool's id and any other decision for its kind, each character neither pattern allows written `_`
 * (`core.run_node` is `core_run_node`). Two variants that come out the same, or a name past the bound, get `_2`,
 * `_3`... in the order they are offered, so one offer always names its tools the same way. A name is read back by
 * looking it up in the offer that made it (`./decision-from-tool-call.ts`), never by undoing this.
 */
export function automationStudioLlmDecisionToolName(variant: AutomationStudioLlmDecisionToolVariant, taken: Set<string>): string {
  const base = (variant.kind === "tool_call" && variant.toolId !== undefined ? variant.toolId : variant.kind).replace(NOT_NAME, "_") || "decision";
  let name = base.slice(0, MOST_NAME_LENGTH);
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${base.slice(0, MOST_NAME_LENGTH - String(suffix).length - 1)}_${suffix}`;
  taken.add(name);
  return name;
}
