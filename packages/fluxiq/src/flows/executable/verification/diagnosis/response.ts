import type { LlmDiagnosisFields } from "./fields.ts";
import type { JsonObject } from "@fluxiq/contracts/core";

export type LlmDiagnosisResponse = {
    kind: "diagnosis"; summary: string; confidence?: number; diagnosis?: LlmDiagnosisFields; metadata?: JsonObject;
    /**
     * Set by a provider adapter, never by a model (t653): the reply was cut off
     * at the provider's output ceiling after its `kind` and a closed `diagnosis`,
     * and only what closed before the cut was read; `summary` is then the
     * adapter's own sentence. A result verification reads this field, never the
     * summary, to hold a yes to the fields that arrived whole
     * (`result-verification/verify.ts`). An adapter drops a model's own claim.
     */
    truncatedAfterVerdict?: true;
  };
