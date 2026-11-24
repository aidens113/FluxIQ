// A tool call whose `toolId` is a value an offered tool's input takes, and
// whose input already names that value there.
//
// run-mwuuo3zk-75b482b3 step 89 and run-mwuxd2v9-33928ea3 step 196 (t1025)
// each wrote a node call whole -- `input: {node: N, parameters, consequences}`
// -- and put the node's id `N` where the tool's id goes. The input is the
// offered tool's own, and it names `N` exactly where that tool lists `N`, so
// the call can mean only that tool; it is read as it, and then checked as any
// call of it is.
//
// Read only when exactly one offered tool and input key list the value and the
// input holds it at that key. A call whose input does not name the value (the
// node's own parameters given as the input, say) is not read: what the rest of
// the tool's input would be -- what the call declares it does, among it -- is
// the model's to say, and it is told how (`../unknown-tool/refusal-of.ts`).

import { automationStudioLlmDecisionInputValueOf } from "./input-value-of.ts";
import type { AutomationStudioLlmDecisionReadingTool } from "./tool.ts";

/** The decision read as a call of the tool whose input names its `toolId`, that tool and the key; nothing when it is not that shape. */
export function automationStudioLlmDecisionValueToolId(decision: unknown, tools: readonly AutomationStudioLlmDecisionReadingTool[] | undefined): { decision: Record<string, unknown>; toolId: string; key: string } | undefined {
  if (!tools?.length || !isRecord(decision) || decision.kind !== "tool_call" || typeof decision.toolId !== "string" || !isRecord(decision.input)) return undefined;
  const asked = decision.toolId;
  if (tools.some((tool) => tool.toolId === asked)) return undefined;
  const places = automationStudioLlmDecisionInputValueOf(asked, tools);
  if (places.length !== 1) return undefined;
  const place = places[0]!;
  if (decision.input[place.key] !== asked) return undefined;
  return { decision: { ...decision, toolId: place.toolId }, toolId: place.toolId, key: place.key };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
