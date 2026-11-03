import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../index.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import type { AutomationStudioStepLoopContext } from "../loop-context.ts";

/** Only passive step data is abbreviated; options retain the real entered engine observation. */
export function stepPropertyContext(options: AutomationStudioGraphExecutionOptions) {
  const node = { id: "one", definitionId: "example.step" };
  const flow = { schemaVersion: "0.1" as const, flowId: "flow.properties", ownerKind: "routine" as const, ownerId: "routine.properties", name: "Properties", createdAt: 1, updatedAt: 1, nodes: [node], edges: [] };
  options.invocation = automationStudioRootInvocation(flow, options);
  options.invocation.run.stack.push(options.invocation.frame);
  const attempt: AutomationStudioNodeAttemptTrace = { attemptId: "one.attempt.1", nodeId: node.id, definitionId: node.definitionId, startedAt: 1, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [] };
  const ctx = {
    options, flow, now: () => 1, startedAt: 1, maxSteps: 20, attempts: [attempt], values: {}, effects: [], regionTransitions: [],
    runState: { variables: new Map(), loops: new Map(), actionEffects: new Map() },
    arrival: { attempts: 1, nodeId: node.id, ordinal: 1, consumed: new Set() }
  } as unknown as AutomationStudioStepLoopContext;
  return { ctx, node, attempt };
}
