import type { AutomationStudioFlowBootstrapFactCondition } from "../index.ts";

/** An alternative entry (C2): taken at invocation, by ascending `order`, when every `when` holds and every `requires` is bound. */
export type AutomationStudioFlowBootstrapEntry = {
  id: string;
  order: number;
  when: AutomationStudioFlowBootstrapFactCondition[];
  requires: string[];
};
