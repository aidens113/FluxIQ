// What a new attempt at a task starts its act record with (t870, plan D6,
// `docs/working/answer-first-plan/reports/second-attempt/design.md`, "What carries between
// attempts"; the rule below is t869's, the lead's call on an open question, for the person to
// overrule).
//
// **The same words typed again carry what landed, however the attempt before it ended.** A person
// who types what they typed before wants what they asked for, so an act that landed is not pressed
// again: it is checked and reported as already done. A status was once read here, and an achieved
// attempt carried nothing, so a second run of a saved Flow pressed every Save again and a toggle
// site undid them all.
//
// **What means "do it again" is a person's press of Run again** (`SVC/answer-first/run-again/`),
// which starts with an empty record whatever is here, and words of their own ("... again") that make
// it another task with its own key. A carry-on is not here: it is the same attempt, with the same record.
//
// **Across many attempts it is a union (`earlier`).** An attempt seeded from the one before already
// holds what that one carried. A Run again holds nothing of it, so what it was spared is kept beside
// its record, and a later attempt carries both: what landed before the press still landed, and so
// did what the press itself landed.
//
//   declared or claimed, landed or may have   carried, and refused as it always was.
//   undeclared, its answer says it changed     carried, and held to a look (`heldOnRepeat`): it
//   something that stays                       is on no result, and nothing else says what it did.
//   undeclared, nothing says that              not carried. It changed nothing, or only moved the
//                                              view, and a Flow presses it as often as it says.
//   undone or not done                         not carried: it did not stand. A state this file has
//                                              not heard of carries, since that is the side a
//                                              mistake can be undone from.
//
// **An act that stood when an attempt ended achieved is marked (`doneInAchieved`, `./done-in-achieved.ts`)**
// and carries so: a count act (`asked` more than its `landings`) has no room in the next attempt, since
// the attempt said the task was done and one press can land several. An act from an attempt that did not
// finish carries unmarked and keeps its room, so the same words go on to finish a count cut short. A
// union keeps the mark: an act once done in an achieved attempt stays so.
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

import type { AutomationStudioAttemptActEntry, AutomationStudioAttemptActRecordData } from "./contracts.ts";

const DID_NOT_STAND: ReadonlySet<string> = new Set(["undone", "not_done"]);

/** The seed for a new attempt from the task's record so far, or none where nothing carries (header). `earlier` is what a Run again left aside. */
export function automationStudioAttemptActSeed(before: { data: AutomationStudioAttemptActRecordData; earlier?: AutomationStudioAttemptActRecordData | undefined }): AutomationStudioAttemptActRecordData | undefined {
  const records = [...(before.earlier ? [before.earlier] : []), before.data];
  const acts = union(records.flatMap((record) => record.acts.filter(carries).map(carried)));
  if (acts.length === 0) return undefined;
  const rows = [...new Map(records.flatMap((record) => record.rows).map((row) => [row.row, { ...row, handles: [] }])).values()];
  return structuredClone({ kind: before.data.kind, schemaVersion: before.data.schemaVersion, acts, rows });
}

function carries(act: AutomationStudioAttemptActEntry): boolean {
  if (DID_NOT_STAND.has(act.state)) return false;
  return !act.undeclared || act.changedState === true;
}

function carried(act: AutomationStudioAttemptActEntry): AutomationStudioAttemptActEntry {
  const frozen = act.keys.filter((key) => !act.handleKeys.includes(key));
  return { ...act, lookedSince: false, carried: true, ...(act.undeclared ? { heldOnRepeat: true as const } : {}), ...(frozen.length > 0 ? { keys: frozen, handleKeys: [] } : {}) };
}

/** One act per id, the latest as it now stands: the same act landed twice is one act that landed. */
function union(acts: readonly AutomationStudioAttemptActEntry[]): AutomationStudioAttemptActEntry[] {
  const held = new Map<string, AutomationStudioAttemptActEntry>();
  for (const act of acts) {
    const known = held.get(act.id);
    held.set(act.id, known ? { ...act, ...(known.doneInAchieved || act.doneInAchieved ? { doneInAchieved: true as const } : {}), keys: [...new Set([...known.keys, ...act.keys])], rows: [...new Set([...known.rows, ...act.rows])], actions: [...new Set([...known.actions, ...act.actions])] } : act);
  }
  return [...held.values()];
}
