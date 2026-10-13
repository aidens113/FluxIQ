// A record set's processing account as the judge is shown it (t493).
//
// **Why.** Live run `run-mv6bg8d8-1a461436` (C round 14): the saved answer's
// `process.where`, "name not contains Charging Case", left out three items
// sold with a charging case beside two real accessories. The judge was shown
// `filteredOut: 5` and nothing else, and four judges read it as five
// accessories. The store now keeps, per condition, the rows it alone left out
// by label (`processAutomationStudioRecordRows`), and they are said here as a
// list read's left-out rows are (`./read-account/alone-rows.ts`): each by its
// label, whole, every one.
//
// **Screened as the stored rows are** (`./result-summary.ts`). With no
// denied-keys declaration nothing the page wrote is carried -- no row, and no
// wording, whose operands may quote it -- only the counts. With one, a label
// from a denied column, or shaped like a credential, is said as withheld and
// still counts; a condition over a denied column, or whose wording is shaped
// like a credential, keeps its counts and loses its wording.
//
// **`testedLabel`** says the condition tested the column every row it names is
// labelled by, the same structural reading a list read's account makes
// (`./read-account/accounts.ts`), so `./request-rows/` may flag those rows as
// it flags a read's. A processing condition only tests stored columns, so the
// column is always there to compare.

import type { AutomationStudioRecordProcessingAccount, AutomationStudioRecordProcessingConditionAccount } from "@fluxiq/contracts/automation-studio";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";

/**
 * One `where` condition of a record set's processing, as the judge is shown it
 * (`processing-account.ts`, t493): its wording, its counts, and the rows it
 * alone left out, each by its label, screened as stored rows are -- the shape
 * of a list read's condition (`AutomationStudioResultReadAccount.conditions`).
 * Wording and rows are absent where no denied-keys declaration was made.
 * `testedLabel` is Core's own bookkeeping, as on a read's condition: the
 * condition tested the column every row it names is labelled by, so
 * `request-rows/` may flag them. No model is shown it
 * (`read-account/without-tested-label.ts`).
 */
export type AutomationStudioResultProcessingCondition = {
  condition?: string;
  rejected: number;
  alone: number;
  leftOutOnlyByThis?: string[];
  testedLabel?: true;
};

/** A record set's processing account as the judge is shown it: the store's counts and passes, and each condition said (`processing-account.ts`). */
export type AutomationStudioResultProcessingAccount = Omit<AutomationStudioRecordProcessingAccount, "conditions"> & {
  conditions?: AutomationStudioResultProcessingCondition[];
};

/** What a label that may not be said reads as: the read account's own word (`./read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** The account as a copy, never the store's own, each condition said under `deniedKeys`; `withheld` when the screen held anything back. */
export function automationStudioResultProcessingAccount(account: AutomationStudioRecordProcessingAccount, deniedKeys: readonly string[] | undefined): { processing: AutomationStudioResultProcessingAccount; withheld: boolean } {
  const { conditions, passes, ...counts } = account;
  let withheld = false;
  const said = conditions?.map((entry) => {
    const one = condition(entry, deniedKeys);
    if (one.withheld) withheld = true;
    return one.condition;
  });
  return { processing: { ...counts, passes: passes.map((pass) => ({ ...pass })), ...(said ? { conditions: said } : {}) }, withheld };
}

function condition(entry: AutomationStudioRecordProcessingConditionAccount, deniedKeys: readonly string[] | undefined): { condition: AutomationStudioResultProcessingCondition; withheld: boolean } {
  const counts = { rejected: entry.rejected, alone: entry.alone };
  if (deniedKeys === undefined) return { condition: counts, withheld: entry.leftOutOnlyByThis.length > 0 };
  let withheld = false;
  const wordingDenied = screenAutomationStudioLlmEvidence({ [entry.field]: "" }, deniedKeys).deniedKey || screenAutomationStudioLlmEvidence(entry.condition, []).secretShaped;
  if (wordingDenied) withheld = true;
  const rows = entry.leftOutOnlyByThis.map((row) => {
    const found = screenAutomationStudioLlmEvidence({ [row.field]: row.label }, deniedKeys);
    if (!found.deniedKey && !found.secretShaped) return row.label;
    withheld = true;
    return WITHHELD_LABEL;
  });
  const testedLabel = entry.leftOutOnlyByThis.length > 0 && entry.leftOutOnlyByThis.every((row) => row.field === entry.field);
  return {
    condition: {
      ...(wordingDenied ? {} : { condition: entry.condition }),
      ...counts,
      ...(rows.length ? { leftOutOnlyByThis: rows } : {}),
      ...(testedLabel ? { testedLabel: true as const } : {})
    },
    withheld
  };
}
