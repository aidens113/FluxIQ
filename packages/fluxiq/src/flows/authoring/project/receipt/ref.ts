import type { AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS } from "./kinds.ts";

export type AutomationStudioProjectReceiptRef = {
  kind: (typeof AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS)[number];
  receiptId: string;
  digest: string;
};
