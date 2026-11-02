import type { JsonObject } from "../../../../core/index.ts";

/** Trusted domain code, supplied by an implementation bundle rather than a manifest. */
export type AutomationStudioRecordingCandidateParameterNormalizer = (
  domainId: string,
  parameters: JsonObject,
  context: { outputId: string; sourceEntryId: string; source: "mapper" }
) => JsonObject;
