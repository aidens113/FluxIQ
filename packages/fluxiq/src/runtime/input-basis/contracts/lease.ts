import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInputRevision } from "./reference.ts";
import type { AutomationStudioInputRead } from "./read.ts";

/** Private runtime access, not evidence that an engine actually used these inputs. */
export type AutomationStudioNormalInputLease = {
  readonly reference: AutomationStudioInputRevision;
  executionCopy(): JsonObject;
  verifyCurrent(): Promise<AutomationStudioInputRead<true>>;
  close(): void;
};
