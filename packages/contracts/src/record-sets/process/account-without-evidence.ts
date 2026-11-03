// A processing account as a public read gives it (t841). `tested` holds a cell of
// a row the answer left out, and `evaluation` the condition as Core evaluated it:
// both are the result check's evidence, read through its own path. No dataset
// endpoint returns a left-out row, so neither leaves the store on a public read.
import type { AutomationStudioRecordProcessingAccount } from "./types.ts";

/** A copy of the account holding neither field, every other field as it was. */
export function automationStudioRecordProcessingAccountWithoutEvidence(account: AutomationStudioRecordProcessingAccount): AutomationStudioRecordProcessingAccount {
  if (!account.conditions) return account;
  return {
    ...account,
    conditions: account.conditions.map(({ evaluation: _evaluation, leftOutOnlyByThis, ...condition }) => ({
      ...condition,
      leftOutOnlyByThis: leftOutOnlyByThis.map(({ tested: _tested, ...row }) => row)
    }))
  };
}
