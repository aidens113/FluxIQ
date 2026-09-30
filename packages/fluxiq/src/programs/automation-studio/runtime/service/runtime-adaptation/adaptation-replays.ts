// Recording what a finished run proved about the saved changes it executed.
//
// `adaptation-confidence/replay.ts` reads a finished run as a replay of every
// applied change stamped on a node it attempted, and says what the run proved.
// It is pure, and until this module nothing in production called it (found by
// lane t179, 2026-09-29): every change stayed `provisional` however many runs it
// went on working, and `established` was unreachable.
//
// This is the half that reads and writes. It loads each change the run
// exercised, asks the replay rule about all of them at once, and saves the ones
// the run proved or contradicted. The rule's own guards stay where they are: a
// change that is not `applied`, one this run already counted, and a run that
// proved nothing all come back with no result, and nothing is written for them.
//
// **Two stores, one rule.** The stamp a run carries is written when a Flow
// Bootstrap adaptation is applied (`flow-bootstrap/adaptation.ts`) -- the Flow a
// build created, or the edit a wrong-answer repair made -- and that record keeps
// its own `validationResults` for exactly this ("trials of the proposed topology
// and replays of the applied one"). A runtime patch is kept in the adaptation
// store. The service's generic read answers a bootstrap record as a projection
// that carries no results and saves nowhere it can be read back from, so the
// bootstrap record is read and written as itself, first.

import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult } from "../../../model/index.ts";
import { recordAutomationStudioAdaptationReplays, type AutomationStudioAdaptationReplayInput, type AutomationStudioAdaptationReplayOutcome, type AutomationStudioAdaptationReplaySubject } from "../../adaptation-confidence/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";

/** Where a saved change is read from and written back to: the service's own stores. */
export type AutomationStudioAdaptationReplayStore = {
  getFlowBootstrapAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioBootstrapAdaptation | null>;
  saveFlowBootstrapAdaptation(adaptation: AutomationStudioBootstrapAdaptation): Promise<unknown>;
  getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null>;
  saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<unknown>;
};

/** One finished run, as the recorder reads it. `flowId` is the Flow the run was started on, which is what a change is saved under. */
export type AutomationStudioRunAdaptationReplays = Pick<AutomationStudioAdaptationReplayInput, "runId" | "checkedAt" | "trace" | "subflowId"> & {
  projectId: string;
  flowId: string;
};

type Loaded =
  | { kind: "bootstrap"; record: AutomationStudioBootstrapAdaptation }
  | { kind: "runtime"; record: AutomationStudioFlowAdaptation };

/**
 * The recorder the run's verification is lent: every change the run exercised,
 * judged as a replay, and the proved or contradicted ones saved. Answers the
 * rule's outcome for each change it could load, in the order the run first
 * reached them.
 */
export function automationStudioAdaptationReplayRecorder(store: AutomationStudioAdaptationReplayStore) {
  return async (run: AutomationStudioRunAdaptationReplays): Promise<AutomationStudioAdaptationReplayOutcome[]> => {
    const ids = exercisedAdaptationIds(run.trace.attempts);
    if (!ids.length) return [];
    const loaded = (await Promise.all(ids.map(async (adaptationId) => await load(store, run, adaptationId)))).filter((entry): entry is Loaded => entry !== undefined);
    const outcomes = recordAutomationStudioAdaptationReplays({
      runId: run.runId,
      checkedAt: run.checkedAt,
      trace: run.trace,
      adaptations: loaded.map(subjectOf),
      ...(run.subflowId !== undefined ? { subflowId: run.subflowId } : {})
    });
    for (const [index, outcome] of outcomes.entries()) {
      const entry = loaded[index]!;
      if (!outcome.result || counted(entry.record.validationResults, outcome.result)) continue;
      if (entry.kind === "bootstrap") await store.saveFlowBootstrapAdaptation(withReplay(entry.record, outcome.result));
      else await store.saveFlowAdaptation(withReplay(entry.record, outcome.result));
    }
    return outcomes;
  };
}

async function load(store: AutomationStudioAdaptationReplayStore, run: AutomationStudioRunAdaptationReplays, adaptationId: string): Promise<Loaded | undefined> {
  const bootstrap = await store.getFlowBootstrapAdaptation(run.projectId, run.flowId, adaptationId);
  if (bootstrap) return { kind: "bootstrap", record: bootstrap };
  const runtime = await store.getFlowAdaptation(run.projectId, run.flowId, adaptationId);
  return runtime ? { kind: "runtime", record: runtime } : undefined;
}

function subjectOf(entry: Loaded): AutomationStudioAdaptationReplaySubject {
  const { adaptationId, riskLevel, status, validationResults } = entry.record;
  return { adaptationId, riskLevel, status, ...(validationResults ? { validationResults } : {}) };
}

/**
 * The record with one result appended. A run already among its results is
 * never appended twice (`withAutomationStudioAdaptationReplay`'s rule), which is
 * checked by the caller before this, so one run can never supply both
 * observations `established` needs.
 */
function withReplay<Record extends { validationResults?: AutomationStudioFlowAdaptationValidationResult[] }>(record: Record, result: AutomationStudioFlowAdaptationValidationResult): Record {
  return { ...record, validationResults: [...(record.validationResults ?? []), result] };
}

function counted(saved: readonly AutomationStudioFlowAdaptationValidationResult[] | undefined, result: AutomationStudioFlowAdaptationValidationResult): boolean {
  return (saved ?? []).some((existing) => existing.runId === result.runId);
}

/** Every change id stamped on an attempt the run made, once each, in the order it first ran. */
function exercisedAdaptationIds(attempts: AutomationStudioRunAdaptationReplays["trace"]["attempts"]): string[] {
  const ids: string[] = [];
  for (const attempt of attempts) {
    for (const adaptationId of attempt.adaptationIds ?? []) if (!ids.includes(adaptationId)) ids.push(adaptationId);
  }
  return ids;
}
