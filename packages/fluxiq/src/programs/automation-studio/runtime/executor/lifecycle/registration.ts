// One handler registration as the dispatcher reads it (state-aware recovery
// plan, C4).
//
// This module owns the registration shape. There is one representation: a
// `builtin.control.handler` node, the authored `failed` edge (or an
// `error.<id>` port) and the optional way-on all read as registrations, and a
// `metadata.clearsInterference` node reads as an implicit automation-scope
// `retry` registration. `./graph-registrations.ts` builds them from a graph.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFactCondition } from "./fact-condition.ts";

/**
 * Where a registration applies. `subflow` applies to the frames running the
 * graph it is stored in, and to their active descendant frames when `inherit`
 * holds (the default). `automation` is legal only in the automation's
 * `recovery`-role Subflow graph, and for the implicit interference
 * registrations.
 */
export type AutomationStudioHandlerScope =
  | { kind: "automation" }
  | { kind: "subflow"; inherit: boolean }
  | { kind: "nodes"; nodeIds: string[] };

/**
 * What the registration was read from.
 *
 * - `handler_node`: an authored Handler; its body starts at `bodyNodeId`.
 * - `failed_edge`: the node's authored `failed` edge or an `error.<id>` port to
 *   another node, a node-scoped On Fail Route along that edge.
 * - `optional_way_on`: an optional step's way on (`../step-skip/optional-step.ts`),
 *   which spends no budget (`budgetFree`).
 * - `clears_interference`: a node whose metadata marks it as clearing
 *   interference; its `when` is that node's `readyState`, carried here in the
 *   host's expectation form because it is not a fact-condition list.
 *
 * Reading the three non-handler sources as registrations describes them; it
 * changes nothing about how they execute today.
 */
export type AutomationStudioHandlerSource =
  | { kind: "handler_node"; nodeId: string; bodyNodeId?: string }
  | { kind: "failed_edge"; nodeId: string; edgeId: string; portId: string; targetNodeId: string }
  | { kind: "optional_way_on"; nodeId: string; edgeId: string; targetNodeId: string }
  | { kind: "clears_interference"; nodeId: string; readyState?: JsonObject };

/**
 * One registration. `handlerId` is unique across the automation's graphs
 * (`<graphFlowId>/<node or edge id>`), so an occurrence key built from it
 * names one handler. `documentIndex` is its place in its graph, the tiebreak
 * after `order`.
 */
export type AutomationStudioHandlerRegistration = {
  handlerId: string;
  graphFlowId: string;
  subflowId: string | null;
  event: AutomationStudioLifecycleEvent;
  scope: AutomationStudioHandlerScope;
  when: AutomationStudioFactCondition[];
  order: number;
  completionCheck: AutomationStudioFactCondition[];
  /** Runs allowed per occurrence of the event; default 1. */
  maxRuns: number;
  documentIndex: number;
  source: AutomationStudioHandlerSource;
  /** Whether running it spends no recovery budget: only the optional way-on. */
  budgetFree: boolean;
};
