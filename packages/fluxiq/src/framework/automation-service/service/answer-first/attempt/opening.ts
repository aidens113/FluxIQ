// What a new attempt finds of its task (design, "Route" and "What carries between attempts").
// Nothing here can stop a task: a memory, a row or an act record that cannot be read reads as
// nothing, and the attempt then starts as a first one would.
//
// **Where it starts.** Saved steps are assembled now, against the binding as it stands, and the
// route is read from that (`../route/`), with what the assembly refused where they did not. `related` is the steps of this Flow's latest attempt at
// another task: a known start for a `build`, never run on its own.
//
// **Which attempt this is** counts the task's attempts across Flows, because the chat makes a new
// Flow each time. The Flow's own rows are read too, so a memory that could not be written does not
// start the count again.
//
// **What it must not do again.** The act record of the task's last attempt, however that attempt
// ended, through `automationStudioAttemptActSeed`'s rule, from the task's own memory, which holds it
// whatever has run on its Flow since. A Flow holds one record, its latest attempt's, so where the
// memory has none the Flow's is read only when its latest row is this task's last attempt.
// `seedFrom` names that attempt, whose before reading the new attempt's witnesses start from.
//
// **A caller's act scope bounds it** (`actScope`; a FluxNode run's, `../../fluxnode/act-scope/`). Each
// run of a FluxNode is its own execution of one task, so only the record of an attempt that ran under the
// same scope is carried, told by the scope its kept caller options name; any other record is another
// execution's, and the attempt starts with an empty one, so its acts land. The task, and so the saved Flow
// it replays, is the same. A record whose attempt's scope is no longer known is another execution's. The
// chat gives no scope, and the same words carry what landed as above.
//
// **A person's Run again starts with nothing carried** (`../run-again/`): that press is what means
// "do it again". What it was spared is kept beside its record (`setAside`), since it still landed.
// It names its own task, as a press names no page: the Flow it was found under is that task's.
//
// **Rows are read through the facade** (`../interrupted/`), so one a restart cut off reads as what
// it is before anything is taken from it.

import { automationStudioAttemptActSeed, type AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioLlmStepLogNote } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstAttemptRecord, AutomationStudioAnswerFirstAttemptStore } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstFlowRunAssemble } from "../flow-run/index.ts";
import { automationStudioAnswerFirstRoute, type AutomationStudioAnswerFirstRoute } from "../route/index.ts";
import type { AutomationStudioAnswerFirstRunAgainHold } from "../run-again/index.ts";
import type { AutomationStudioAnswerFirstRunActStore } from "../run-acts/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstAttemptProvenance, type AutomationStudioAnswerFirstTaskMemory, type AutomationStudioAnswerFirstTaskMemoryStore } from "../task-memory/index.ts";
import { automationStudioAnswerFirstBestEffort } from "./best-effort.ts";
import { automationStudioAnswerFirstTaskWords } from "./task-words.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "./contracts.ts";

export type AutomationStudioAnswerFirstOpening = {
  taskId: string;
  memory: AutomationStudioAnswerFirstTaskMemoryStore;
  route: AutomationStudioAnswerFirstRoute;
  ordinal: number;
  /** What the attempt starts its draft from. */
  steps: AutomationStudioFlowDraftStep[];
  seed?: AutomationStudioAttemptActRecordData | undefined;
  /** The one attempt whose record `seed` came from, whose before reading its witnesses start from (`../witnesses/earlier.ts`). None where it unites several. */
  seedFrom?: string | undefined;
  /** What a person's Run again started without. */
  setAside?: AutomationStudioAttemptActRecordData | undefined;
  /** This Flow already holds an act record, which from now on would read as this attempt's. */
  actsHeldHere: boolean;
  startedFrom?: AutomationStudioAnswerFirstAttemptProvenance["startedFrom"];
  /** The task's own humanness level as it was kept, where it has one: a task without one takes the person's starting value (`./run-attempt.ts`). */
  humanness?: number | undefined;
};

type Stores = { store: Pick<AutomationStudioAnswerFirstAttemptStore, "list">; acts: AutomationStudioAnswerFirstRunActStore };

/** Reads what the task kept (header). */
export async function automationStudioAnswerFirstOpening(input: AutomationStudioAnswerFirstAttemptInput, stores: Stores, again?: AutomationStudioAnswerFirstRunAgainHold): Promise<AutomationStudioAnswerFirstOpening> {
  const { projectId, flowId } = input;
  // A caller that names its task (a FluxNode's name and spec hash) is known by that, whatever its words (`../task-key/task-key.ts`).
  const taskId = again?.taskId ?? automationStudioAnswerFirstTaskKey({ instructionText: automationStudioAnswerFirstTaskWords(input), startLocation: input.startLocation, callerKey: input.caller?.taskKey });
  const memory = automationStudioAnswerFirstTaskMemoryOf(input.owner, input.stores);
  const kept = await readOrNothing(() => memory.get(projectId, taskId));
  const rows = (await readOrNothing(() => stores.store.list(projectId, flowId))) ?? [];
  const route = await routeOf(input, taskId, kept, rows);
  const here = await automationStudioAnswerFirstBestEffort(() => stores.acts.get(projectId, flowId));
  const carried = await seedOf(projectId, kept, stores, input.caller?.actScope);
  return {
    taskId, memory, route,
    ordinal: ordinalOf(taskId, kept, rows),
    steps: stepsOf(route),
    ...(again ? { setAside: carried?.data } : { seed: carried?.data, seedFrom: carried?.from }),
    // A record nobody can read is held here too: this attempt's own replaces it.
    actsHeldHere: !here.ok || here.value !== undefined,
    ...(kept?.humanness !== undefined ? { humanness: kept.humanness } : {}),
    ...(route.kind === "build" ? {} : { startedFrom: { attemptId: route.saved.attemptId, flowId: route.saved.flowId, stepsDigest: route.saved.stepsDigest, steps: route.saved.steps.length, notes: route.notes.length, provenWhole: route.saved.provenWhole } })
  };
}

async function routeOf(input: AutomationStudioAnswerFirstAttemptInput, taskId: string, kept: AutomationStudioAnswerFirstTaskMemory | undefined, rows: readonly AutomationStudioAnswerFirstAttemptRecord[]): Promise<AutomationStudioAnswerFirstRoute> {
  const assembled = kept?.best?.steps?.length ? await automationStudioAnswerFirstFlowRunAssemble({ input }, kept.best.steps) : undefined;
  // Codes belong in a step log, which a person does not read: without them nobody can say why saved steps never ran.
  if (assembled && !assembled.ok) automationStudioLlmStepLogNote(`The saved steps did not assemble, so this attempt repairs them and does not run them: ${[...assembled.codes, ...(assembled.issues ?? [])].join(", ") || "no code given"}`);
  const related = [...rows].reverse().find((row) => row.attempt.taskId !== taskId && row.steps?.length);
  return automationStudioAnswerFirstRoute({
    memory: kept, projectId: input.projectId, flowId: input.flowId, taskId,
    // What the assembly refused, at which step, goes with a repair to the model that repairs the steps (`./round-note.ts`).
    assemble: () => (assembled?.ok ? { ok: true } : { ok: false, codes: assembled?.codes ?? [], ...(assembled?.told ? { told: assembled.told } : {}) }),
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

/**
 * The seed, and the one attempt it is of: none where a Run again's set-aside acts are united with it, since no one before reading came ahead of both.
 * Under an act scope, only an attempt of that scope's (header).
 */
async function seedOf(projectId: string, kept: AutomationStudioAnswerFirstTaskMemory | undefined, stores: Stores, scope: string | undefined): Promise<{ data: AutomationStudioAttemptActRecordData; from?: string } | undefined> {
  const ours = (attemptId: string): boolean => scope === undefined || kept?.attempts.find((attempt) => attempt.attemptId === attemptId)?.caller?.actScope === scope;
  const held = kept?.acts;
  if (held && ours(held.attemptId)) return seeded(automationStudioAttemptActSeed({ data: held.data, earlier: held.earlier }), held.earlier ? undefined : held.attemptId);
  // Unscoped this is the task's last attempt; scoped, the scope's own last, whose record the Flow may still hold where the task's memory missed it.
  const last = [...(kept?.attempts ?? [])].reverse().find((attempt) => ours(attempt.attemptId));
  if (!last) return undefined;
  const rows = (await readOrNothing(() => stores.store.list(projectId, last.flowId))) ?? [];
  const row = rows.find((each) => each.attempt.attemptId === last.attemptId);
  // Scoped, the Flow's record is taken only where its latest row is known to be that attempt: it may be another execution's.
  if (row ? rows.at(-1) !== row : scope !== undefined) return undefined;
  const data = await readOrNothing(() => stores.acts.get(projectId, last.flowId));
  return data ? seeded(automationStudioAttemptActSeed({ data }), last.attemptId) : undefined;
}

function seeded(data: AutomationStudioAttemptActRecordData | undefined, from: string | undefined): { data: AutomationStudioAttemptActRecordData; from?: string } | undefined {
  return data ? { data, ...(from === undefined ? {} : { from }) } : undefined;
}

async function readOrNothing<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  const answer = await automationStudioAnswerFirstBestEffort(read);
  return answer.ok ? answer.value : undefined;
}
