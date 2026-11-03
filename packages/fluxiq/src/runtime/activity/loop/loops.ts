import type { AutomationStudioActivityLoop } from "./types.ts";
import { automationStudioActivityReads } from "./reads.ts";

/** The do-while loop's head (`nodes/control-flow/repeat.ts`), by whole id. */
const REPEAT_DEFINITION_ID = "builtin.control.repeat";

/**
 * Every do-while loop of a Flow (`nodes/control-flow/repeat.ts`). A loop's
 * members are the nodes a pass can run: reached from the Repeat's `body`
 * route without passing the Repeat, and able to come back to it. A step after
 * the loop -- reached by the last step's `ended` route or the Repeat's `done`
 * -- never comes back, so it is no member. `head` names another loop's head
 * whose `body` route begins its passes the same way: a list loop's For Each
 * (`./row.ts`).
 */
export function automationStudioActivityLoops(flow: {
  nodes: readonly { id: string; definitionId: string }[];
  edges: readonly { sourceNodeId: string; targetNodeId: string; sourcePortId?: string | undefined }[];
}, head: string = REPEAT_DEFINITION_ID): AutomationStudioActivityLoop[] {
  const definitionOf = new Map(flow.nodes.map((node) => [node.id, node.definitionId]));
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of flow.edges) {
    forward.set(edge.sourceNodeId, [...(forward.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    backward.set(edge.targetNodeId, [...(backward.get(edge.targetNodeId) ?? []), edge.sourceNodeId]);
  }
  const reach = (from: readonly string[], links: Map<string, string[]>, stop: string): Set<string> => {
    const seen = new Set<string>();
    const queue = from.filter((id) => id !== stop);
    for (const id of queue) seen.add(id);
    while (queue.length) {
      for (const next of links.get(queue.shift()!) ?? []) {
        if (next === stop || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };
  return flow.nodes.filter((node) => node.definitionId === head).map((repeat) => {
    const body = flow.edges.filter((edge) => edge.sourceNodeId === repeat.id && edge.sourcePortId === "body").map((edge) => edge.targetNodeId);
    const comesBack = reach(backward.get(repeat.id) ?? [], backward, repeat.id);
    const members = new Set([...reach(body, forward, repeat.id)].filter((id) => comesBack.has(id)));
    const unit = [...members].some((id) => automationStudioActivityReads(definitionOf.get(id))) ? "page" as const : "pass" as const;
    return { repeatId: repeat.id, members, unit };
  });
}
