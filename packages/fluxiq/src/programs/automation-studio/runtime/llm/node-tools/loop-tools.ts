// The tools one evidence loop offers, and how the loop reads them.
//
// The set is fixed for the whole loop: the caller's tools, with `core.run_flow`
// after them where the loop drafts and runs its dry run (`./run-flow.ts`).
// It is read once, here, because everything the loop decides about a tool --
// whether it exists, what it is, whether any mutation is reachable at all --
// is a question about that one fixed set.
import { automationStudioLlmEvidenceValidTools } from "../evidence-loop-decision.ts";
import { automationStudioLlmRunFlowBinding } from "./run-flow.ts";

type RunFlowBinding = ReturnType<typeof automationStudioLlmRunFlowBinding>;

export type AutomationStudioLlmEvidenceLoopToolSet = {
  /** Answers `core.run_flow` by running the draft's steps, and passes every other call to the caller's executor. */
  runFlow: RunFlowBinding;
  tools: RunFlowBinding["tools"];
  toolIds: Set<string>;
  toolsById: Map<string, RunFlowBinding["tools"][number]>;
  /**
   * Whether any mutation is reachable at all. It is what decides whether a
   * mutation-gated observation is gated or simply shut (`../repeat-policy.ts`).
   */
  mutableTools: boolean;
};

/** The loop's tool set, or `undefined` when the caller's tools are not a valid set. */
export function automationStudioLlmEvidenceLoopToolSet(input: Parameters<typeof automationStudioLlmRunFlowBinding>[0]): AutomationStudioLlmEvidenceLoopToolSet | undefined {
  const runFlow = automationStudioLlmRunFlowBinding(input);
  const tools = runFlow.tools;
  if (!automationStudioLlmEvidenceValidTools(tools)) return undefined;
  return {
    runFlow,
    tools,
    toolIds: new Set(tools.map((tool) => tool.toolId)),
    toolsById: new Map(tools.map((tool) => [tool.toolId, tool] as const)),
    mutableTools: tools.some((tool) => tool.effect === "mutate" || tool.perCallEffect === true)
  };
}
