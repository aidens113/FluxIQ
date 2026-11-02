import type { ModelRunBudgetLedger } from "../../agents/ledger/index.ts";

/** Read-only view of the original purse and ledger; it cannot open or reserve budget. */
export interface VerificationAccountingSource {
  readonly current?: { readonly ledger: Pick<ModelRunBudgetLedger, "snapshot" | "callRecords"> } | undefined;
  readonly history?: { readonly gate: unknown } | undefined;
  readonly diagnostic?: { readonly code: string; readonly message: string } | undefined;
}
