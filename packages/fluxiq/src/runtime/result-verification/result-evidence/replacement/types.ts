import type { AutomationStudioResultEvidenceSourceRef } from "./source.ts";

/** Core-owned receipts for exact rereads and proven complete fresh collections. Never model-authored authority. */
export type AutomationStudioResultEvidenceSourceReplacements = {
  version: 1;
  receipts: readonly {
    kind: "page" | "collection";
    from: readonly AutomationStudioResultEvidenceSourceRef[];
    to: readonly AutomationStudioResultEvidenceSourceRef[];
  }[];
};
