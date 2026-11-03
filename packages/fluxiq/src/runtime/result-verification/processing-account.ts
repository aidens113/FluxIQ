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
//
// **`number`** is the condition's place in `process.where`, from 1: the index
// every line names it by (`./read-account/condition-name.ts`, t574).

import {
  automationStudioRecordConditionText,
  parseAutomationStudioRecordCondition,
  type AutomationStudioRecordProcessingAccount,
  type AutomationStudioRecordProcessingConditionAccount,
  type AutomationStudioRecordProcessingTestedValue
} from "@fluxiq/contracts/automation";
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
  /** Its place in `process.where`, counting from 1 (header); absent only on a condition built by hand. */
  number?: number;
  condition?: string;
  rejected: number;
  alone: number;
  leftOutOnlyByThis?: string[];
  testedLabel?: true;
  /** How Core read the tested value on a few rows the answer kept (`./value-readings/`, t511). */
  valuesRead?: string[];
  /** Screened evaluator context and row-aligned tested cells, absent on legacy or inconsistent accounts. */
  evaluation?: NonNullable<AutomationStudioRecordProcessingConditionAccount["evaluation"]>;
  leftOutObservations?: Array<AutomationStudioRecordProcessingTestedValue | { state: "withheld" } | null>;
  /** The same measured-value settlement used for native reads; the model must still quote the request's condition. */
  leftOutSettled?: string[];
  settled?: string;
  settledKind?: "bound" | "presence" | "text";
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
  const said = conditions?.map((entry, index) => {
    const one = condition(entry, deniedKeys);
    if (one.withheld) withheld = true;
    return { number: index + 1, ...one.condition };
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
  const evaluation = wordingDenied ? undefined : evaluatedContext(entry);
  // No raw condition operand bypasses the same backstop used for its wording.
  const contextScreen = evaluation && screenAutomationStudioLlmEvidence({ [entry.field]: evaluation.condition }, deniedKeys);
  const safeEvaluation = contextScreen?.deniedKey || contextScreen?.secretShaped ? undefined : evaluation;
  if (evaluation && !safeEvaluation) withheld = true;
  const observations = safeEvaluation ? entry.leftOutOnlyByThis.map((row, index) => {
    if (rows[index] === WITHHELD_LABEL) return { state: "withheld" as const };
    const tested = testedValue(row.tested);
    if (!tested) return null;
    if (tested.state === "absent" || tested.state === "unavailable") return { state: tested.state };
    if (tested.state !== "present" || typeof tested.value !== "string") return null;
    const found = screenAutomationStudioLlmEvidence({ [entry.field]: tested.value }, deniedKeys);
    if (!found.deniedKey && !found.secretShaped) return { state: "present" as const, value: tested.value };
    withheld = true;
    return { state: "withheld" as const };
  }) : undefined;
  return {
    condition: {
      ...(wordingDenied ? {} : { condition: entry.condition }),
      ...counts,
      ...(rows.length ? { leftOutOnlyByThis: rows } : {}),
      ...(testedLabel ? { testedLabel: true as const } : {}),
      ...(safeEvaluation ? { evaluation: safeEvaluation } : {}),
      ...(observations?.length ? { leftOutObservations: observations } : {})
    },
    withheld
  };
}

/** A persisted public type is still read at runtime: malformed or stale context grants no measured evidence. */
function evaluatedContext(entry: AutomationStudioRecordProcessingConditionAccount): AutomationStudioResultProcessingCondition["evaluation"] {
  const value = entry.evaluation;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "condition" && key !== "now") || !Number.isFinite(value.now)) return undefined;
  const condition = parseAutomationStudioRecordCondition(value.condition);
  return condition && condition.field === entry.field && automationStudioRecordConditionText(condition) === entry.condition
    ? { condition, now: value.now } : undefined;
}

/** Only the producer's exact cell shapes survive a JSON/public-contract boundary. */
function testedValue(value: unknown): AutomationStudioRecordProcessingTestedValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const state = Reflect.get(value, "state");
  if (state === "absent" || state === "unavailable") return keys.length === 1 && keys[0] === "state" ? { state } : null;
  const cell = Reflect.get(value, "value");
  return state === "present" && keys.length === 2 && keys.includes("state") && keys.includes("value") && typeof cell === "string" && cell.trim().length > 0
    ? { state, value: cell } : null;
}
