// A request to bring one node of a Flow graph into view and select it, from a
// view that does not own the canvas (the Inspector's "Effective handlers"
// links). The Flow editor that shows that graph answers it by selecting the
// node exactly as its own outline does, so the selection it publishes carries
// the editor's node data, not a copy rebuilt elsewhere.
//
// In-process listeners, like the studio's action registry: no DOM event, and
// nothing is kept once delivered.

export type AutomationGraphNodeFocusRequest = {
  /** The graph the node is in; an editor showing another graph ignores the request. */
  flowId?: string;
  nodeId: string;
};

type Listener = (request: AutomationGraphNodeFocusRequest) => void;

const listeners = new Set<Listener>();

/** Asks every mounted Flow editor to select the node; the one showing its graph does. */
export function requestAutomationGraphNodeFocus(request: AutomationGraphNodeFocusRequest): void {
  for (const listener of [...listeners]) listener(request);
}

/** Listens for focus requests until the returned function is called. */
export function subscribeAutomationGraphNodeFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
