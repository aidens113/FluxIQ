// The narrow port Core's own harness options run against.
//
// Core owns the options but not the data behind them: reading a Flow's graph,
// capturing the state the Flow acts on, or listing what has been tried before
// all belong to the service and the host runtime. Rather than let a built-in
// option reach into either, each one calls exactly one method here.
//
// Every method is optional, and an option is registered only when its method
// is bound, so a host that binds nothing keeps today's behaviour exactly and
// binding one method adds one option. Nothing in this port names a page, a
// selector, a tab or a browser; the nouns are Flow, node, state and
// adaptation, which every domain has.

import type { JsonObject } from "../../../../../core/index.ts";

export type AutomationStudioHarnessOptionHostContext = {
  projectId: string;
  flowId: string;
  runId?: string;
  signal?: AbortSignal;
};

export type AutomationStudioHarnessOptionHost = {
  /** The Flow as authored: its nodes, their definitions and parameters, and
   * how they are wired. */
  describeFlowGraph?(input: AutomationStudioHarnessOptionHostContext): Promise<JsonObject>;
  /** One node in detail: resolved inputs, expected state, retry settings. */
  describeNode?(input: AutomationStudioHarnessOptionHostContext & { nodeId: string }): Promise<JsonObject>;
  /** The node definitions available in this Flow's scope. */
  listAvailableNodes?(input: AutomationStudioHarnessOptionHostContext): Promise<JsonObject>;
  /** The current state of whatever the Flow acts on, as the host reports it.
   * Requires the host runtime's `state-snapshot` capability. */
  captureStateSnapshot?(input: AutomationStudioHarnessOptionHostContext): Promise<JsonObject>;
  /** What changed between two captured states. Requires `state-diff`. */
  inspectStateDiff?(input: AutomationStudioHarnessOptionHostContext & { beforeRef: string; afterRef: string }): Promise<JsonObject>;
  /** Adaptations already recorded for this Flow, and whether each one worked. */
  listPriorAdaptations?(input: AutomationStudioHarnessOptionHostContext & { limit: number; failureSignature?: string }): Promise<JsonObject>;
};
