import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";

// A reference to a trial receipt. The receipt itself stays with its candidate
// owner; the build record holds only this. A `subflow_trial` is a partial
// receipt -- useful evidence, never credit toward promotion -- and only a
// `candidate_trial` of a whole candidate can be.

export const AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS = Object.freeze(["subflow_trial", "candidate_trial"] as const);

export type AutomationStudioProjectReceiptRef = {
  kind: (typeof AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS)[number];
  receiptId: string;
  digest: string;
};

/** Reads one receipt reference; throws a refusal for `shape.parse`. */
export function readAutomationStudioProjectReceiptRef(value: unknown, path: string): AutomationStudioProjectReceiptRef {
  const fields = shape.object(value, path, ["kind", "receiptId", "digest"]);
  return {
    kind: shape.oneOf(fields.kind, `${path}.kind`, AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS),
    receiptId: shape.id(fields.receiptId, `${path}.receiptId`),
    digest: shape.digest(fields.digest, `${path}.digest`)
  };
}
