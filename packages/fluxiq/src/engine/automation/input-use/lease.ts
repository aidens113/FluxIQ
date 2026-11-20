import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInputRevision } from "../../../runtime/input-basis/contracts/index.ts";
import type { AutomationStudioInputUseRead } from "./read.ts";

export type AutomationStudioInputUseLease = {
  readonly reference: AutomationStudioInputRevision;
  executionCopy(): JsonObject;
  verifyCurrent(signal?: AbortSignal): Promise<AutomationStudioInputUseRead<true>>;
  close(): void;
};
