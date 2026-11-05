// What really reached the target as a run went, told from outside the trace. A trace a deadline
// overtook holds no attempts (`engine/automation/composite/child-bounds.ts`), so this is what still
// says how far the run got, and it alone can tell a step the run gate passed over from one it sent.

import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;
const POLICY_OUTPUT_EFFECT = "policy.output.dispatch";

export type AutomationStudioAnswerFirstFlowRunWatch = {
  /** Sees what gets past the run gate: `options`, before the gate wraps them. */
  sent(options: AutomationStudioGraphExecutionOptions): AutomationStudioGraphExecutionOptions;
  /** Sees what reaches the run gate: `options`, after it wrapped them. */
  asked(options: AutomationStudioGraphExecutionOptions): AutomationStudioGraphExecutionOptions;
  /** The nodes in the order they first went out. */
  order(): readonly string[];
  /** Calls of this node the gate passed on to the target. */
  sentCount(nodeId: string): number;
  /** Calls of this node that reached the gate. */
  askedCount(nodeId: string): number;
  /** Sent calls of this node that came back success. */
  succeededCount(nodeId: string): number;
  /** Whether any call has gone out. */
  anySent(): boolean;
};

export function automationStudioAnswerFirstFlowRunWatch(stepped: () => void): AutomationStudioAnswerFirstFlowRunWatch {
  const sent = new Map<string, number>();
  const asked = new Map<string, number>();
  const succeeded = new Map<string, number>();
  const order: string[] = [];
  let any = false;
  /** Outputs a native node just emitted: the same step, already counted. */
  let fromNative = 0;
  const add = (counts: Map<string, number>, nodeId: string): void => { counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1); };
  return {
    sent(options) {
      const watched = { ...options };
      const native = options.nativeNodeExecutor;
      if (native) watched.nativeNodeExecutor = (async (request) => {
        add(sent, request.node.id);
        if (!order.includes(request.node.id)) order.push(request.node.id);
        any = true;
        stepped();
        const execution = await native(request);
        if (execution?.result.status === "success") add(succeeded, request.node.id);
        fromNative = (execution?.result.effects ?? []).filter((effect) => effect.type === POLICY_OUTPUT_EFFECT).length;
        return execution;
      }) as Native;
      const dispatcher = options.effectDispatcher;
      if (dispatcher) watched.effectDispatcher = (async (effect, context) => {
        if (effect.type === POLICY_OUTPUT_EFFECT && fromNative > 0) fromNative -= 1;
        else if (effect.type === POLICY_OUTPUT_EFFECT) {
          any = true;
          stepped();
        }
        return await dispatcher(effect, context);
      }) as Dispatcher;
      return watched;
    },
    asked(options) {
      const native = options.nativeNodeExecutor;
      if (!native) return options;
      return { ...options, nativeNodeExecutor: (async (request) => {
        add(asked, request.node.id);
        return await native(request);
      }) as Native };
    },
    order: () => order,
    sentCount: (nodeId) => sent.get(nodeId) ?? 0,
    askedCount: (nodeId) => asked.get(nodeId) ?? 0,
    succeededCount: (nodeId) => succeeded.get(nodeId) ?? 0,
    anySent: () => any
  };
}
