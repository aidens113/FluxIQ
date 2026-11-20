import type { AutomationStudioInputRevision } from "../../../../runtime/input-basis/contracts/index.ts";
import type { AutomationStudioInputUseLocation } from "../location.ts";
import type { AutomationStudioInputUseNodeConsumer } from "./consumer.ts";
import type { AutomationStudioInputUseNodeValues } from "./values.ts";

/**
 * The frozen snapshot shown to the node authority, taken from the exact pair before the first evidence await.
 * `entry` is the frame's own sealed-so-far graph-entry revision; IDs are labels, `occurrence` the private association.
 */
export type AutomationStudioInputUseNodeCapture = Readonly<{
  values: AutomationStudioInputUseNodeValues;
  consumer: AutomationStudioInputUseNodeConsumer;
  location: AutomationStudioInputUseLocation;
  entry: AutomationStudioInputRevision;
  nodeId: string;
  attemptId: string;
  refreshed: boolean;
  occurrence: object;
}>;
