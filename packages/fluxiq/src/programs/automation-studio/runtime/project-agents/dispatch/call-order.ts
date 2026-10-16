import type { AutomationStudioFlowBootstrapSubflow } from "../../flow-bootstrap/plan/index.ts";

// How data crosses subflows (automation-project-agents-plan.md, `How data
// crosses subflows`): the one rule that says, for the plan's callable
// subflows, the order they are called in and where each input's value comes
// from. Each callee runs after the callees its predecessors name, plan order
// between equals; each input is bound to the latest earlier callee that hands
// back an output of the same name, or, where none does, to the Flow's own
// value of that name.
//
// Assembly binds the calls it writes by it (`../supervisor/assembly.ts`), and a
// brief's scope reads its handed-on inputs by it (`./scope.ts`, t672), so a
// builder is never told an input is the person's value while assembly would
// bind it to another subflow's output, or the other way round. It lives here,
// not in the supervisor, because the supervisor imports the dispatcher and
// never the reverse.

/** One callee in call order, each of its inputs with the position of the earlier callee it is bound to; `from` absent is the Flow's own value. */
export type AutomationStudioProjectCall = {
  subflow: AutomationStudioFlowBootstrapSubflow;
  inputs: Array<{ id: string; from?: number }>;
};

/** The callees in call order with each input's source (header); undefined when their predecessors make a circle. */
export function automationStudioProjectCallOrder(
  callees: readonly AutomationStudioFlowBootstrapSubflow[],
  predecessors: ReadonlyMap<string, readonly string[]>
): AutomationStudioProjectCall[] | undefined {
  const keys = new Set(callees.map((callee) => callee.key));
  const ordered: AutomationStudioFlowBootstrapSubflow[] = [];
  const placed = new Set<string>();
  while (ordered.length < callees.length) {
    const next = callees.find((callee) => !placed.has(callee.key) && (predecessors.get(callee.key) ?? []).every((key) => !keys.has(key) || placed.has(key)));
    if (!next) return undefined;
    placed.add(next.key);
    ordered.push(next);
  }
  return ordered.map((subflow, index) => ({
    subflow,
    inputs: (subflow.interface?.inputs ?? []).map((port) => {
      const from = ordered.slice(0, index).map((earlier, at) => ({ earlier, at })).reverse().find(({ earlier }) => earlier.interface?.outputs.some((output) => output.id === port.id));
      return from ? { id: port.id, from: from.at } : { id: port.id };
    })
  }));
}
