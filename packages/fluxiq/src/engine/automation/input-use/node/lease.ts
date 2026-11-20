import type { AutomationStudioInputRevision } from "../../../../runtime/input-basis/contracts/index.ts";
import type { AutomationStudioInputUseRead } from "../read.ts";
import type { AutomationStudioInputUseNodeValues } from "./values.ts";

/** A node authority's lease over one callback's pair; its execution copy must equal the snapshot exactly. */
export type AutomationStudioInputUseNodeLease = {
  readonly reference: AutomationStudioInputRevision;
  executionCopy(): AutomationStudioInputUseNodeValues;
  verifyCurrent(signal?: AbortSignal): Promise<AutomationStudioInputUseRead<true>>;
  close(): void;
};
