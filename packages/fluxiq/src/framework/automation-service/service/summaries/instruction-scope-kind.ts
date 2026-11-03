import type { AutomationStudioInstructionSummary } from "../indexes/index.ts";
import { instructionScopeKindFromSql, sqlInstructionScopeKind } from "./sql-conversions.ts";

/**
 * One vocabulary for instruction scope kinds at the summary listing boundary.
 *
 * Project SQL stores an `adaptation_review` scope as `flow` and an `on_error`
 * scope as `error` (`service/flows/store.ts`), and cannot tell a review scope
 * without a Subflow from a Flow scope, while the summary index keeps each
 * instruction's own kind. So that a caller cannot tell which side served the
 * page, the index side answers as SQL does: every kind is filtered, scoped and
 * sorted as SQL stores it (`key`, `sqlKey`), and reported as SQL reads it back
 * (`reported`). Nothing stored changes (t558).
 */
export const automationStudioInstructionListingScopeKind = {
  /** The kind as project SQL stores it: what a filter, Subflow scope or scope sort compares. */
  key(scopeKind: string): string {
    return sqlInstructionScopeKind(scopeKind);
  },
  /** The kind a summary reports, as project SQL reads its stored kind back. */
  reported(scopeKind: AutomationStudioInstructionSummary["scopeKind"]): AutomationStudioInstructionSummary["scopeKind"] {
    return instructionScopeKindFromSql(sqlInstructionScopeKind(scopeKind));
  },
  /** `key`, as a SQL expression over a JSON column that holds the index's kind. */
  sqlKey(column: string): string {
    return `(case ${column} when 'on_error' then 'error' when 'adaptation_review' then 'flow' else ${column} end)`;
  }
};
