// The permission gate for one recovery: what it may do that outlasts it, and
// on whose authority.
//
// One gate per recovery, built once the provider has resolved -- the
// resolution is where the grant's permitted set arrives -- and shared by every
// stage that can act. The exploration hands its check to each action; the
// patch stage reads the same gate, so a request raised while exploring ends
// the recovery there and the patch call is not made.
//
// **Two authorities, both the person's.** The grant's `permittedConsequences`
// are what the person allowed this run. The instructed set is what the
// person's own instruction already asks for, stored with the Flow when its
// build read the instruction. A recovery never asks a model to read the
// instruction again: authority a model derived mid-recovery would be authority
// nobody reviewed. It reads the stored set and keeps an entry only while its
// instruction is active and its text unchanged
// (`currentAutomationStudioInstructedConsequences`), so an edited instruction's
// authority has lapsed and the recovery asks.
//
// **The request is answerable when there is a thread to answer it in.** A
// recovery whose run has a parking port bound puts its question there and
// waits, exactly as a build does, so the gate must not end the run on raising
// one. Without a port there is nowhere to ask, the gate keeps its own ending,
// and the recovery stops on the request as it always did.
//
// **Not the policy flag.** `policy.allowExternalSideEffects` is not read on this
// path. It used to withhold every acting option from a recovery outright, so a
// recovery could never press anything and never ask anyone either. The gate is
// the authority now: capable by default, and a lasting consequence nobody
// allowed becomes a request a person answers.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import {
  AutomationStudioActionPermissionGate,
  automationStudioConsequencesInOrder,
  currentAutomationStudioInstructedConsequences,
  isAutomationStudioActionConsequence,
  type AutomationStudioActionConsequence,
  type AutomationStudioInstructedConsequence
} from "../../action-permissions/index.ts";

/** The recovery's authority, as classes only: what a run detail records and a reader compares. */
export type AutomationStudioRecoveryPermissionSummary = {
  /** What the grant allowed, in Core's order. Empty when it allowed nothing. */
  granted: AutomationStudioActionConsequence[];
  /** What the person's instruction asks for, from the set stored with the Flow and still current. */
  instructed: AutomationStudioActionConsequence[];
  /** What the stored set once held and no longer stands for: its instruction changed or is inactive. */
  lapsed: AutomationStudioActionConsequence[];
};

export type AutomationStudioRecoveryPermissions = {
  /** The one gate every acting stage of this recovery is checked against. */
  gate: AutomationStudioActionPermissionGate;
  summary(): AutomationStudioRecoveryPermissionSummary;
};

export function automationStudioRecoveryPermissionGate(input: {
  /** From the provider resolution. Absent permits nothing. */
  granted: readonly string[] | undefined;
  /** The parent Flow's `metadata.bootstrapInstructedConsequences`, as stored. Anything unreadable is not an entry. */
  storedInstructed: unknown;
  /** The Flow's instructions; only the active ones carry authority, and the run carries them out. */
  instructions: readonly AutomationStudioFlowInstruction[];
  /** The failure packet the diagnosis was shown, so a request may name a control from it. */
  failureEvidence?: JsonObject | undefined;
  /**
   * Whether a request this recovery raises will be put to a person. True keeps
   * the gate from aborting its own signal on raising one, because the caller is
   * about to wait for an answer and will settle the gate itself.
   */
  answerable?: boolean | undefined;
  now?: (() => number) | undefined;
  newRequestId?: (() => string) | undefined;
}): AutomationStudioRecoveryPermissions {
  const active = input.instructions.filter((instruction) => instruction.status === "active");
  const standing = currentAutomationStudioInstructedConsequences({
    stored: input.storedInstructed,
    activeInstructions: active.map((instruction) => ({ instructionId: instruction.instructionId, title: instruction.title, body: instruction.body }))
  });
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.granted,
    stage: "recovery",
    instructionIds: active.map((instruction) => instruction.instructionId),
    instructed: standing.current,
    ...(input.answerable ? { endsOnRequest: false } : {}),
    now: input.now,
    newRequestId: input.newRequestId
  });
  if (input.failureEvidence) gate.observe(input.failureEvidence);
  const summary: AutomationStudioRecoveryPermissionSummary = {
    granted: automationStudioConsequencesInOrder((input.granted ?? []).filter(isAutomationStudioActionConsequence)),
    instructed: classesOf(standing.current),
    lapsed: classesOf(standing.lapsed)
  };
  return {
    gate,
    summary: () => ({ granted: [...summary.granted], instructed: [...summary.instructed], lapsed: [...summary.lapsed] })
  };
}

function classesOf(entries: readonly AutomationStudioInstructedConsequence[]): AutomationStudioActionConsequence[] {
  return automationStudioConsequencesInOrder(entries.map((entry) => entry.consequence));
}
