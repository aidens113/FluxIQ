// Where an id a call named as its tool is instead a value an offered tool's
// input lists.
//
// A tool that runs whichever of many named things a call names (a node, an
// action) lists those names as an `enum` of one input key. A model that writes
// one of those names as the `toolId` has named the thing, not the tool that
// runs it: t1025, bigbox runs of 2026-11-24, where 8 of 22 unreadable replies
// wrote a node's id as the `toolId`. Read from the offered input schemas
// alone, so no tool and no name is special here.

import type { AutomationStudioLlmDecisionReadingTool } from "./tool.ts";

/** Each offered tool and top-level input key whose enumerated values include `value`, in offer order. */
export function automationStudioLlmDecisionInputValueOf(value: string, tools: readonly AutomationStudioLlmDecisionReadingTool[]): Array<{ toolId: string; key: string }> {
  const found: Array<{ toolId: string; key: string }> = [];
  for (const tool of tools) {
    const properties = tool.inputSchema.properties;
    if (!isRecord(properties)) continue;
    for (const [key, property] of Object.entries(properties)) {
      if (isRecord(property) && Array.isArray(property.enum) && property.enum.includes(value)) found.push({ toolId: tool.toolId, key });
    }
  }
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
