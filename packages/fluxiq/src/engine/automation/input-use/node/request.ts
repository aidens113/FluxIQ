import type { AutomationStudioInputUseNodeConsumer } from "./consumer.ts";
import type { AutomationStudioInputUseNodeValues } from "./values.ts";

/** What engine dispatch hands the node controller just before one actual callback; never request data. */
export type AutomationStudioInputUseNodeRequest = Readonly<{
  consumer: AutomationStudioInputUseNodeConsumer;
  /** Labels only: equal IDs never stand in for the private occurrence below. */
  nodeId: string;
  attemptId: string;
  /** One private object per actual execute call, shared by that call's callback branches. */
  occurrence: object;
  values: AutomationStudioInputUseNodeValues;
  /** Whether a target refresh replaced the resolved parameters for this attempt. */
  refreshed: boolean;
  signal?: AbortSignal | undefined;
}>;
