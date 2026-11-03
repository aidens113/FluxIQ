import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { ExecutableChangeProposalKind as AutomationStudioChangeProposalKind } from "./kind.ts";

export type AutomationStudioChangeProposalPatch = {
  kind: AutomationStudioChangeProposalKind;
  targetId?: string;
  summary: string;
  before?: JsonValue;
  after?: JsonValue;
  metadata?: JsonObject;
};
