import type { AutomationStudioProjectReceiptRef } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";
import { AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS } from "../../../../flows/authoring/project/index.ts";

/** Reads one receipt reference; throws a refusal for `shape.parse`. */
export function readAutomationStudioProjectReceiptRef(value: unknown, path: string): AutomationStudioProjectReceiptRef {
  const fields = shape.object(value, path, ["kind", "receiptId", "digest"]);
  return {
    kind: shape.oneOf(fields.kind, `${path}.kind`, AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS),
    receiptId: shape.id(fields.receiptId, `${path}.receiptId`),
    digest: shape.digest(fields.digest, `${path}.digest`)
  };
}
