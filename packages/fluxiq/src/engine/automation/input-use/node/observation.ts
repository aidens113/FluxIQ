import type { AutomationStudioInputRevision } from "../../../../runtime/input-basis/contracts/index.ts";
import type { AutomationStudioInputUseLocation } from "../location.ts";
import type { AutomationStudioInputUseUnknown } from "../unknown.ts";
import type { AutomationStudioInputUseNodeConsumer } from "./consumer.ts";

type Labels = { consumer: AutomationStudioInputUseNodeConsumer; nodeId: string; attemptId: string; uncovered: readonly string[] };

/**
 * One actual callback invocation. A seal covers only the pair that callback received: `uncovered` names what it
 * never covers (live ports, native implementation entry, effects, child entry). Never an aggregate receipt.
 */
export type AutomationStudioInputUseNodeObservation =
  | Readonly<Labels & { status: "sealed"; coverage: "node_invocation_values"; reference: AutomationStudioInputRevision; location: AutomationStudioInputUseLocation }>
  | Readonly<Labels & { status: "unknown"; code: AutomationStudioInputUseUnknown }>;
