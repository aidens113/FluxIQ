import type { ResultProcessingCondition } from "./processing-condition.ts";
import type { AutomationStudioRecordProcessingAccount } from "@fluxiq/contracts/records";

/** A record set's processing account as the judge is shown it: the store's counts and passes, and each condition said (`processing-account.ts`). */

export type ResultProcessingAccount = Omit<AutomationStudioRecordProcessingAccount, "conditions"> & {
  conditions?: ResultProcessingCondition[];
};
