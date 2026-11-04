// What a new attempt finds of its task (design, "Route" and "What carries between attempts").
// Nothing here can stop a task: a memory, a row or an act record that cannot be read reads as
// nothing, and the attempt then starts as a first one would.
//
// **Where it starts.** Saved steps are assembled now, against the binding as it stands, and the
// route is read from that (`../route/`). `related` is the steps of this Flow's latest attempt at
// another task: a known start for a `build`, never run on its own.
//
// **Which attempt this is** counts the task's attempts across Flows, because the chat makes a new
// Flow each time. The Flow's own rows are read too, so a memory that could not be written does not
// start the count again.
//
// **What it must not do again.** The act record of the task's last attempt, through
// `automationStudioAttemptActSeed`'s table, from the task's own memory, which holds it whatever has
// run on its Flow since. A Flow holds one record, its latest attempt's, so where the memory has
// none the Flow's is read only when its latest row is this task's last attempt. An attempt with no
// row yet died before its first write, and counts as unfinished.
//
// **Rows are read through the facade** (`../interrupted/`), so one a restart cut off reads as what
// it is before anything is taken from it.

import { automationStudioAttemptActSeed, type AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstAttemptRecord, AutomationStudioAnswerFirstAttemptStore } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstFlowRunAssemble } from "../flow-run/index.ts";
import { automationStudioAnswerFirstRoute, type AutomationStudioAnswerFirstRoute } from "../route/index.ts";
import type { AutomationStudioAnswerFirstRunActStore } from "../run-acts/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstAttemptProvenance, type AutomationStudioAnswerFirstTaskMemory, type AutomationStudioAnswerFirstTaskMemoryStore } from "../task-memory/index.ts";
import { automationStudioAnswerFirstBestEffort } from "./best-effort.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "./contracts.ts";

export type AutomationStudioAnswerFirstOpening = {
  taskId: string;
  memory: AutomationStudioAnswerFirstTaskMemoryStore;
  route: AutomationStudioAnswerFirstRoute;
  ordinal: number;
  /** What the attempt starts its draft from. */
  steps: AutomationStudioFlowDraftStep[];
  seed?: AutomationStudioAttemptActRecordData | undefined;
  /** This Flow already holds an act record, which from now on would read as this attempt's. */
  actsHeldHere: boolean;
  startedFrom?: AutomationStudioAnswerFirstAttemptProvenance["startedFrom"];
};

type Stores = { store: Pick<AutomationStudioAnswerFirstAttemptStore, "list">; acts: AutomationStudioAnswerFirstRunActStore };

/** Reads what the task kept (header). */
export async function automationStudioAnswerFirstOpening(input: AutomationStudioAnswerFirstAttemptInput, stores: Stores): Promise<AutomationStudioAnswerFirstOpening> {
  const { projectId, flowId } = input;
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: input.instructionText, startLocation: input.startLocation });
  const memory = automationStudioAnswerFirstTaskMemoryOf(input.owner, input.stores);
  const kept = await readOrNothing(() => memory.get(projectId, taskId));
  const rows = (await readOrNothing(() => stores.store.list(projectId, flowId))) ?? [];
  const route = await routeOf(input, taskId, kept, rows);
  const here = await automationStudioAnswerFirstBestEffort(() => stores.acts.get(projectId, flowId));
  return {
    taskId, memory, route,
    ordinal: ordinalOf(taskId, kept, rows),
    steps: stepsOf(route),
    seed: await seedOf(projectId, kept, stores),
    // A record nobody can read is held here too: this attempt's own replaces it.
    actsHeldHere: !here.ok || here.value !== undefined,
    ...(route.kind === "build" ? {} : { startedFrom: { attemptId: route.saved.attemptId, flowId: route.saved.flowId, stepsDigest: route.saved.stepsDigest, steps: route.saved.steps.length, notes: route.notes.length, provenWhole: route.saved.provenWhole } })
  };
}

async function routeOf(input: AutomationStudioAnswerFirstAttemptInput, taskId: string, kept: AutomationStudioAnswerFirstTaskMemory | undefined, rows: readonly AutomationStudioAnswerFirstAttemptRecord[]): Promise<AutomationStudioAnswerFirstRoute> {
  const assembled = kept?.best?.steps?.length ? await automationStudioAnswerFirstFlowRunAssemble({ input }, kept.best.steps) : undefined;
  const related = [...rows].reverse().find((row) => row.attempt.taskId !== taskId && row.steps?.length);
  return automationStudioAnswerFirstRoute({
    memory: kept, projectId: input.projectId, flowId: input.flowId, taskId,
    assemble: () => (assembled?.ok ? { ok: true } : { ok: false, codes: assembled?.codes ?? [] }),
    ...(related?.steps ? { related: { steps: [...related.steps], flowId: input.flowId } } : {})
  });
}

function stepsOf(route: AutomationStudioAnswerFirstRoute): AutomationStudioFlowDraftStep[] {
  if (route.kind === "build") return route.related ? [...route.related.steps] : [];
  return [...route.saved.steps];
}

function ordinalOf(taskId: string, kept: AutomationStudioAnswerFirstTaskMemory | undefined, rows: readonly AutomationStudioAnswerFirstAttemptRecord[]): number {
  const counted = [...(kept?.attempts ?? []).map((attempt) => attempt.ordinal), ...rows.filter((row) => row.attempt.taskId === taskId).map((row) => row.attempt.ordinal)];
  return Math.max(0, ...counted) + 1;
}

async function seedOf(projectId: string, kept: AutomationStudioAnswerFirstTaskMemory | undefined, stores: Stores): Promise<AutomationStudioAttemptActRecordData | undefined> {
  const held = kept?.acts;
  if (held) {
    const rows = (await readOrNothing(() => stores.store.list(projectId, held.flowId))) ?? [];
    return automationStudioAttemptActSeed({ status: rows.find((each) => each.attempt.attemptId === held.attemptId)?.attempt.status ?? "working", data: held.data });
  }
  const last = kept?.attempts.at(-1);
  if (!last) return undefined;
  const rows = (await readOrNothing(() => stores.store.list(projectId, last.flowId))) ?? [];
  const row = rows.find((each) => each.attempt.attemptId === last.attemptId);
  if (row && rows.at(-1) !== row) return undefined;
  const data = await readOrNothing(() => stores.acts.get(projectId, last.flowId));
  return data ? automationStudioAttemptActSeed({ status: row?.attempt.status ?? "working", data }) : undefined;
}

async function readOrNothing<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  const answer = await automationStudioAnswerFirstBestEffort(read);
  return answer.ok ? answer.value : undefined;
}
