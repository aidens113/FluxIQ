// The four records that hold acts today, as one list (plan D6; discovery section 5).
//
// None of the four knows a call's parameters, so an act that came only from them is told
// and listed, and refuses a call only where a source named its Flow step:
//
//   project ledger    every act of a build by brief, with whether it is left: `did`, `left`.
//   build record      what survives a restart: its classes and whether it can be undone.
//                     Joins the ledger on the same `act-N`, so one act is one entry.
//   trial ledger      per pass, by node; a step's own key names it across a revision.
//   run completed     the run's own ledger: its key is unique, its row is only words.
//
// The act record's own calls are the identity that matters on the exploration path; these
// bring a build that already ran into an attempt.

import { automationStudioAttemptActDigest } from "../identity/index.ts";
import type { AutomationStudioAttemptActEntry, AutomationStudioAttemptActMerged, AutomationStudioAttemptActRecordData } from "../contracts.ts";
import { automationStudioAttemptActScreenedWords } from "../words.ts";

const ID_DIGEST_LENGTH = 40;

/** The merged list as data a record can be seeded from. A later source fills what an earlier one left, and its state stands only over a weaker one. */
export function automationStudioAttemptActMergedData(sources: ReadonlyArray<readonly AutomationStudioAttemptActMerged[]>, now: () => number = Date.now): AutomationStudioAttemptActRecordData {
  const bySource = new Map<string, AutomationStudioAttemptActMerged>();
  for (const merged of sources.flat()) {
    const known = bySource.get(merged.sourceId);
    bySource.set(merged.sourceId, known ? joined(known, merged) : merged);
  }
  return { kind: "attempt_act_record", schemaVersion: 1, rows: [], acts: [...bySource.values()].map((merged) => entryOf(merged, now())) };
}

function joined(first: AutomationStudioAttemptActMerged, second: AutomationStudioAttemptActMerged): AutomationStudioAttemptActMerged {
  const classes = first.classes?.length ? first.classes : second.classes;
  const undo = first.undo ?? second.undo;
  const steps = [...new Set([...(first.steps ?? []), ...(second.steps ?? [])])];
  const { undeclared: _first, ...kept } = first;
  return {
    ...kept,
    ...(classes ? { classes } : {}),
    ...(undo ? { undo } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    // An act a later source gave a class is no longer undeclared.
    ...(first.undeclared && second.undeclared && !classes?.length ? { undeclared: true as const } : {})
  };
}

function entryOf(merged: AutomationStudioAttemptActMerged, at: number): AutomationStudioAttemptActEntry {
  const classes = [...(merged.classes ?? [])];
  const words = automationStudioAttemptActScreenedWords({ what: merged.what, where: merged.where }, classes);
  const how = merged.undo ? automationStudioAttemptActScreenedWords({ what: merged.undo.how }, []).what : undefined;
  return {
    id: `act.${automationStudioAttemptActDigest({ source: merged.sourceId }).slice(0, ID_DIGEST_LENGTH)}`,
    what: words.what, where: words.where, classes, state: merged.state,
    ...(how !== undefined && how === merged.undo?.how ? { undo: { how } } : {}),
    ...(merged.undeclared ? { undeclared: true as const } : {}),
    stage: merged.stage,
    actions: merged.actionId ? [merged.actionId] : [],
    keys: [], handleKeys: [], rows: [],
    ...(merged.steps?.length ? { steps: merged.steps } : {}),
    lookedSince: false,
    at
  };
}
