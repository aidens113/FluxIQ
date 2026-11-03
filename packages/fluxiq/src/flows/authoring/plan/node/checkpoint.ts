import type { AutomationStudioFlowBootstrapFactCondition } from "../index.ts";

/** A recovery checkpoint (C2): the only node a handler's route may move to. */
export type AutomationStudioFlowBootstrapCheckpoint = {
  id: string;
  when?: AutomationStudioFlowBootstrapFactCondition[];
  requires: string[];
};
