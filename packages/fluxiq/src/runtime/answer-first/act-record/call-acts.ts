// Which act each call of an attempt made, and naming those acts by the steps their calls became (t1075 B,
// `./record.ts`, "An act named by the step it became"). The record's collaborator: it holds the call ids, the record
// holds the acts.
//
// **By the loop's call id, in memory.** A model names its calls itself, so one id may come back in a fresh round for
// another act: an id two acts answered to names neither. A Core that restarted mid-attempt holds none, and the acts
// made before it are then known by their identity alone, as every act was before.
//
// **What a step must say.** A step an earlier attempt kept keeps the call id it had then, which this attempt's model may
// have used again. So a step names an act only where the act answers to what the step says its call was sent or ran
// with (`forms`), read as the act was read when it was made.

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioAttemptActEntry } from "./contracts.ts";
import { automationStudioAttemptActTargetKeys } from "./identity/index.ts";

type Entry = AutomationStudioAttemptActEntry;

/** One step's name for the act its call made, with what the step says that call was. */
export type AutomationStudioAttemptActStepStamp = { callId: string; step: string; forms: ReadonlyArray<{ actionId: string; parameters: JsonObject }> };

export class AutomationStudioAttemptActCalls {
  /** The act each call made; `null` where two acts answered to one id (header). */
  private readonly byCall = new Map<string, Entry | null>();
  private readonly held: { entries: () => readonly Entry[]; changed: () => void };

  constructor(held: { entries: () => readonly Entry[]; changed: () => void }) {
    this.held = held;
  }

  /** The call `callId` made `entry`; an id another act already answered to names neither (header). */
  note(callId: string | undefined, entry: Entry): void {
    if (callId === undefined) return;
    const known = this.byCall.get(callId);
    this.byCall.set(callId, known === undefined || known === entry ? entry : null);
  }

  /** The entry a call's begin made is gone again, so the call names no act until its answer says which. */
  forget(callId: string | undefined, entry: Entry): void {
    if (callId !== undefined && this.byCall.get(callId) === entry) this.byCall.delete(callId);
  }

  /** The id of the act the call `callId` made, where one call made one act that the record still holds. */
  actOf(callId: string): string | undefined {
    return this.entryOf(callId)?.id;
  }

  /**
   * The Flow the attempt saved: each act a call of it made is named by the step that call became (`step`, a run gate's
   * step name), where the act answers to one of the step's `forms` (header). Says how many acts it named.
   */
  stepsOf(made: readonly AutomationStudioAttemptActStepStamp[]): number {
    const named = new Set<Entry>();
    for (const { callId, step, forms } of made) {
      const entry = this.entryOf(callId);
      if (!entry || entry.steps?.includes(step) || !forms.some((form) => answersTo(entry, form))) continue;
      entry.steps = [...(entry.steps ?? []), step];
      named.add(entry);
    }
    if (named.size > 0) this.held.changed();
    return named.size;
  }

  private entryOf(callId: string): Entry | undefined {
    const entry = this.byCall.get(callId);
    return entry && this.held.entries().includes(entry) ? entry : undefined;
  }
}

/** Whether an entry answers to a call sent as `form`, by any key of it: the same call, read as the record read it when it was made. */
function answersTo(entry: Entry, form: { actionId: string; parameters: JsonObject }): boolean {
  const target = automationStudioAttemptActTargetKeys(form.actionId, form.parameters);
  return [...target.keys, ...target.placeKeys].some((key) => entry.keys.includes(key)) || target.handleKeys.some((key) => entry.handleKeys.includes(key));
}
