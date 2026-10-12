// The shapes the editor's handler views read (state-aware recovery plan, C2
// and C4). They mirror Core's `runtime/executor/lifecycle/registration.ts`
// and `subflow-contract.ts`, which no public Core entry point exports; Core
// stays the authority on what a registration is and how it resolves.

/** One node of a graph as the handler views read it: the editor's draft and a saved Flow both reduce to this. */
export type HandlerGraphNode = {
  id: string;
  /** The name a person sees, or empty when the node has none. */
  label: string;
  definitionId?: string;
  parameterValues: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

/** One route of that graph: the source port names what kind of route it is (`success`, `failed`, `body`, ...). */
export type HandlerGraphEdge = {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
};

/** One graph: the Flow's own, a part another step calls, or the automation's recovery part. */
export type HandlerGraph = {
  graphId: string;
  name: string;
  /** The role of the Subflow this is the graph of, when known; only `recovery` may hold whole-automation handlers. */
  role?: string;
  nodes: HandlerGraphNode[];
  edges: HandlerGraphEdge[];
};

/** The lifecycle boundaries a handler may register for (C3). */
export type FlowLifecycleEvent = "start" | "before" | "retry" | "fail" | "before_next";

/** Where a registration applies (C4). */
export type FlowHandlerScope =
  | { kind: "automation" }
  | { kind: "subflow"; inherit: boolean }
  | { kind: "nodes"; nodeIds: string[] };

/** One declarative condition over the page (C9); `target` is the host's own form. */
export type FlowFactCondition = {
  fact: string;
  op: string;
  value?: unknown;
  target?: Record<string, unknown>;
};

/**
 * What a registration was read from: an authored Handler (with the steps its
 * body reaches and the Handler Ends that close it), a node's own failure
 * route, or a node marked as clearing interference.
 */
export type FlowHandlerSource =
  | { kind: "handler_node"; nodeId: string; bodyNodeIds: string[]; endNodeIds: string[] }
  | { kind: "failed_edge"; nodeId: string; edgeId: string; targetNodeId: string; wayOn: boolean }
  | { kind: "clears_interference"; nodeId: string };

/** One registration, as Core's `AutomationStudioHandlerRegistration` carries it. */
export type FlowHandlerRegistration = {
  handlerId: string;
  graphId: string;
  event: FlowLifecycleEvent;
  scope: FlowHandlerScope;
  when: FlowFactCondition[];
  order: number;
  completionCheck: FlowFactCondition[];
  maxRuns: number;
  documentIndex: number;
  source: FlowHandlerSource;
};

/** The four resolution levels, nearest first (C4). */
export type FlowHandlerLevel = "node" | "subflow" | "ancestor" | "automation";

/** One registration that applies to a node, with where it was found. */
export type EffectiveFlowHandler = {
  registration: FlowHandlerRegistration;
  level: FlowHandlerLevel;
  graphId: string;
  graphName: string;
  /** How many calls away the part holding it is; 0 for this graph and the whole automation. */
  distance: number;
};

/** A place a run may begin or come back to (C2). */
export type FlowStateMarker =
  | { kind: "start" }
  | { kind: "entry"; id: string; order: number; when: FlowFactCondition[] }
  | { kind: "checkpoint"; id: string; when: FlowFactCondition[] };
