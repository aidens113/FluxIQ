// What a new attempt at a task starts its act record with (t870, plan D6,
// `docs/working/answer-first-plan/reports/second-attempt/design.md`, "What carries between
// attempts").
//
//   achieved     nothing: "next time we try that task" is a new ask, and a person asking
//                again means it.
//   anything else  every act of the attempt that landed or may have: the ask was not
//                finished, so what landed is what it would otherwise repeat. A status this
//                file has not heard of carries too, since that is the side a mistake can be
//                undone from.
//
// A carry-on of the same attempt is not here: it is the same attempt, with the same record.
//
// **What does not carry, with the attempt that held it.**
//
//   a look        a may-have-landed act was looked at on the page as it stood then, so the
//                 new attempt looks again before it retries one.
//   the page      `place` ties a by-hand act to the page in hand, and a new attempt's page
//                 is its own.
//   handles       a handle names one control only while one attempt authors its Flow
//                 (`./identity/target-keys.ts`), so another attempt's `t7` may be any control
//                 here. An act's handle form goes, and it is known by its frozen form. An act
//                 known by nothing else keeps it: it died before it was frozen, and being
//                 held to a look by a handle that means something else costs one look, where
//                 losing it costs the act done twice.

import type { AutomationStudioTaskAttemptStatus } from "@fluxiq/contracts/automation";
import type { AutomationStudioAttemptActEntry, AutomationStudioAttemptActRecordData } from "./contracts.ts";

/** The seed for a new attempt from the one before it, or none where nothing carries (header). */
export function automationStudioAttemptActSeed(before: { status: AutomationStudioTaskAttemptStatus; data: AutomationStudioAttemptActRecordData }): AutomationStudioAttemptActRecordData | undefined {
  if (before.status === "achieved") return undefined;
  const acts = before.data.acts.filter((act) => act.state === "landed" || act.state === "may_have_landed").map(carried);
  if (acts.length === 0) return undefined;
  return structuredClone({ kind: before.data.kind, schemaVersion: before.data.schemaVersion, acts, rows: before.data.rows.map((row) => ({ ...row, handles: [] })) });
}

function carried(act: AutomationStudioAttemptActEntry): AutomationStudioAttemptActEntry {
  const frozen = act.keys.filter((key) => !act.handleKeys.includes(key));
  return { ...act, lookedSince: false, ...(frozen.length > 0 ? { keys: frozen, handleKeys: [] } : {}) };
}
