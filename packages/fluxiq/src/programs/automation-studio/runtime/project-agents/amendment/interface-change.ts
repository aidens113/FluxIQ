import type { AutomationStudioFlowBootstrapInterface } from "../../flow-bootstrap/plan/index.ts";

/**
 * What an amendment did to a subflow's outputs when a done proposal of it can
 * be carried (`./subflow-change.ts`): each output renamed, old name to new, and
 * each output removed with nothing in its place.
 */
export type AutomationStudioProjectSupervisorInterfaceChange = { renamedOutputs: Array<{ from: string; to: string }>; removedOutputs: string[] };

/**
 * How `now` changed `then`'s outputs, when it changed only them and only in a
 * way a carried proposal can follow. The inputs must be the same: a done
 * proposal reads every input it declares (`subflow.input_unread`,
 * `flow-bootstrap/subflow-candidate/callable-target.ts`, t581), so an input
 * taken away is one its steps read, and one added is one they never had.
 * Every output that stays must stay as it was. Then (t658) the outputs gone
 * are renamed, in the order written, onto the new ones, when there are at
 * least as many new ones -- any beyond are added -- or (t671) they are removed,
 * when there is no new one: a narrowing. Undefined for anything else -- some
 * outputs gone and fewer new ones, which reads no way for certain -- and when
 * one side has an interface and the other none.
 */
export function automationStudioProjectSupervisorInterfaceChange(then: AutomationStudioFlowBootstrapInterface | undefined, now: AutomationStudioFlowBootstrapInterface | undefined): AutomationStudioProjectSupervisorInterfaceChange | undefined {
  if (!then || !now) return then === now ? { renamedOutputs: [], removedOutputs: [] } : undefined;
  if (!same(then.inputs, now.inputs)) return undefined;
  const ids = (ports: AutomationStudioFlowBootstrapInterface["outputs"]) => ports.map((port) => port.id);
  const gone = ids(then.outputs).filter((id) => !ids(now.outputs).includes(id));
  const fresh = ids(now.outputs).filter((id) => !ids(then.outputs).includes(id));
  const stayed = then.outputs.filter((port) => !gone.includes(port.id));
  if (stayed.some((port) => !same(port, now.outputs.find((other) => other.id === port.id)))) return undefined;
  if (gone.length <= fresh.length) return { renamedOutputs: gone.map((from, index) => ({ from, to: fresh[index]! })), removedOutputs: [] };
  return fresh.length ? undefined : { renamedOutputs: [], removedOutputs: gone };
}

/** Whether two plain values hold the same JSON. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
