import type { JsonObject } from "../../../../core/index.ts";
import type { ExecutableRouter } from "../router.ts";
import type { ExecutableSubflowTarget } from "../subflow.ts";

/** Router execution data; policy is an unused compatibility slot, never an engine dependency. */
export type ExecutableRouterExecutionInput<TRouter extends ExecutableRouter = ExecutableRouter, TSubflow extends ExecutableSubflowTarget = ExecutableSubflowTarget> = {
  projectId: string;
  flowId: string;
  flowVersion?: string;
  inputs?: JsonObject;
  currentStateSummary?: JsonObject;
  router: TRouter;
  subflows: TSubflow[];
  adaptationPolicy?: unknown;
  rerouteSource?: { fromSubflowId: string; reason: string };
  /** Provenance only; observed values stay in the execution input. */
  stateSource?: { observed: boolean; paths: string[]; unavailable?: string };
  now?: () => number;
};
