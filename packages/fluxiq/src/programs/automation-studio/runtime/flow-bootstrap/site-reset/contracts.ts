// What the build's permission wrapper and the site-reset ledger say to each
// other (t462: a build resets the site before it re-runs its Flow; user,
// 2026-10-12).
//
// Before every trial of a candidate the model returns the site to the state
// the build started from, through the site's own controls, undoing exactly the
// lasting acts this build made and nothing that was there before it began. An
// exploration call that undoes one names that act under `undoes` on its
// `core.run_node` input. The ledger reads the claim; the permission wrapper
// (`../action-permissions.ts`) strips the key before the domain sees the call,
// hands the gate the classes undoing that act may do unasked, and tells the
// ledger what every call it ran did. Only the ledger decides which act a claim
// may name: the gate never learns what an act was.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionEffect } from "../../action-permissions/index.ts";

/** The `core.run_node` input key under which a call names the act of this build it undoes. */
export const AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY = "undoes";

/** One undo, as the permission gate is told it: the act it reverses, and the gated classes reversing that act may do without asking. */
export type AutomationStudioSiteResetUndo = { act: string; allowed: readonly AutomationStudioActionConsequence[] };

/**
 * How the ledger reads a call's `undoes` value: `none` when the call names no
 * act; `refused`, with the evidence the model is answered with instead of the
 * call running, when it names no act of this build that may be undone now; and
 * otherwise the undo the gate is told.
 */
export type AutomationStudioSiteResetClaim =
  | { kind: "none" }
  | { kind: "refused"; evidence: JsonObject }
  | { kind: "undo"; undo: AutomationStudioSiteResetUndo };

/** What the permission gate read of the action a call put to it, as Core answered it. */
export type AutomationStudioSiteResetDeclared = {
  permitted: boolean;
  effect: AutomationStudioActionEffect;
  consequences: readonly AutomationStudioActionConsequence[];
  /** The control as the gate carries it to a person: `name` is null where it was withheld. */
  control: { name: string | null; kind: string | null };
  verb: string;
};

/** One exploration call that ran, as the build's permission wrapper tells the ledger. */
export type AutomationStudioSiteResetExplored = {
  callId: string;
  toolId: string;
  /** The act this call undoes, when its claim was read as an undo. */
  undoes?: string;
  /** The last action the domain put to the gate for this call; absent when it put none. */
  declared?: AutomationStudioSiteResetDeclared;
  /** The call applied an effect and did not answer `ok: false`. */
  landed: boolean;
};

/** The ledger, as the build's permission wrapper sees it. */
export type AutomationStudioSiteResetCalls = {
  claim(undoes: unknown): AutomationStudioSiteResetClaim;
  explored(call: AutomationStudioSiteResetExplored): void;
};

/**
 * One lasting act of this build as the model is shown it: its id, which
 * `undoes` names, what it did, and for an act made while exploring the call id
 * the model gave that call, so it can find the act in its own evidence.
 */
export type AutomationStudioSiteResetNamedAct = { act: string; did: string; call?: string };

/**
 * What the start check found before a trial: whether taking the target back
 * to the build's start (the arrival) applied an effect, and what still
 * differs from how the build found it. `differs` is absent when the domain
 * could not say -- no start state, no arrival, or a failure -- and the
 * ledger alone decides.
 */
export type AutomationStudioSiteResetComparison = { moved: boolean; differs?: string[] };

/**
 * The reset's answer before a trial: run it, saying under `startedWith` what
 * was still in place or different when it was admitted without a full reset;
 * or refuse it with the evidence the model is answered with. A refusal is not
 * a trial, and `moved` says whether the arrival applied an effect.
 */
export type AutomationStudioSiteResetDecision =
  | { kind: "admit"; startedWith?: JsonObject }
  | { kind: "refuse"; evidence: JsonObject & { code: string }; moved: boolean };

/** One lasting act a trial made, as the ledger reads it (`AutomationStudioCandidateTrialAct`, `../candidate/contracts.ts`). */
export type AutomationStudioSiteResetTrialAct = {
  step: number;
  definitionId: string;
  label?: string;
  control?: string;
  consequences: readonly AutomationStudioActionConsequence[];
};

/** What the trial gate (`../candidate/trial-gate.ts`) is given: asked before each trial, and told what each trial left. */
export type AutomationStudioSiteResetTrialReset = {
  beforeTrial(signal?: AbortSignal): Promise<AutomationStudioSiteResetDecision>;
  /** Restarts the reset phase and answers the acts now on the site, the trial's own among them (`leftOnSite`). */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[];
};
