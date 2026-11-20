// The draft of run `run-mwouhs7i-b22d9399` (company-website apprentices) as the
// build held it just before it wrote the page loop: the entry the model was
// shown at decide 0051, read back into draft steps. Steps 9, 10 and 11 are the
// three kept presses of Next page; the repeat on step 6 while step 9 succeeds
// is the decision that came next.
import { readFileSync } from "node:fs";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

/** The tool a node step ran through (`runtime/llm/node-tools/run/node.ts`), restated so this support imports nothing from `llm/`. */
const RUN_NODE_TOOL_ID = "core.run_node";

type RecordedLine = { step: number; actionId: string; input: Record<string, unknown>; disposition: string; callId: string };

/** Each recorded line as the draft step it was: a node step when it ran a node, a look otherwise. */
export function recordedApprenticesDraft(): AutomationStudioFlowDraftStep[] {
  const recorded = JSON.parse(readFileSync(new URL("./recorded-run-mwouhs7i.json", import.meta.url), "utf8")) as { steps: RecordedLine[] };
  return recorded.steps.map((line) => {
    const node = typeof line.input.node === "string";
    const read = line.actionId.endsWith("extract_list");
    const failed = line.disposition === "did_not_work";
    return {
      position: line.step,
      id: `d${line.step}`,
      iteration: line.step,
      callId: line.callId,
      actionId: line.actionId,
      ...(node ? { toolId: RUN_NODE_TOOL_ID } : {}),
      input: structuredClone(line.input) as AutomationStudioFlowDraftStep["input"],
      effect: node && !read ? "mutate" : "observe",
      ...(read ? { proposes: true } : {}),
      effectApplied: !failed && (node || line.disposition !== "look"),
      disposition: line.disposition === "kept" ? "kept" : "taken"
    };
  });
}
