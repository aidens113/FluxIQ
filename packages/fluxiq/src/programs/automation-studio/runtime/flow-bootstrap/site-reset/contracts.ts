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
import type { AutomationStudioSiteResetCollection, AutomationStudioSiteResetUnmet } from "../reset-settlement/index.ts";

// The `undoes` key moved to `../reset-settlement/undoes-key.ts` (t743), which the settle words say it from; it stays
// exported here for the callers that import this file directly (`../action-permissions.ts`).
export { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY } from "../reset-settlement/index.ts";

/** One undo, as the permission gate is told it: the act it reverses, and the gated classes reversing that act may do without asking. */
export type AutomationStudioSiteResetUndo = { act: string; allowed: readonly AutomationStudioActionConsequence[] };

/**
 * Where a control sits, as the domain declared it (t475): opaque tokens for the
 * item -- row, card, list item -- and the dialog, compared only for equality.
 * Absent where the control sits in no item, or in no dialog. Two absent items
 * are never the same item (t479).
 *
 * And what it is about (t719), as opaque tokens of one kind, so either may
 * equal the other: `subject`, the title of the item it sits in, or for a
 * control in no item the nearest titled part of the page around it; `page`,
 * what its page is about (its main heading). An act whose effect shows on
 * another page or in another list -- an add from a detail page whose line
 * appears in the basket, a line moved to a saved list -- has no item an undo
 * there can match, and is tied to that undo by these instead (`./ledger.ts`,
 * `target`). Absent where the domain found none.
 *
 * And the control itself (L1 reset settlement): `place`, the opaque slot it
 * occupies on its page, which every read of that page reports its controls by
 * (`AutomationStudioSiteResetRead.controls`), and `state`, a digest of its own
 * state there (name, pressed, checked, selected) just before the act. A press
 * that turned that state into another one at the same place is a toggle the
 * ledger can see come back (`../reset-settlement/`). Absent where the domain gave none.
 */
export type AutomationStudioSiteResetSpot = { item?: string; dialog?: string; subject?: string; page?: string; scope?: string; resource?: string; place?: string; state?: string };

/**
 * What an undo call may do to the control the domain is about to act on
 * (t475), read before the press: admitted with the gated classes it may do
 * unasked, or refused with the evidence the model is answered with, and the
 * control is never acted on. `on` says why it was admitted:
 *
 * - `created`: an item the act itself made, proven by the act's own page
 *   before and after it; the one place an unasked removal is allowed.
 * - `own`: the act's own item and dialog -- the same row, the same layer.
 * - `follow_up`: a control in a dialog, with no item, after an undo of the
 *   same act landed on its own or created item: the site asking to confirm.
 * - `moving`: nothing lasting and no item -- going to a page, opening a view.
 * - `subject`: a control about what the act was about (t719), by a positive
 *   match of their `subject` tokens -- the act's `page` too where it sat in no
 *   item -- with a class that reverses the act's; nothing unasked.
 */
export type AutomationStudioSiteResetTarget =
  | { kind: "admit"; on: "created" | "own" | "follow_up" | "moving" | "subject"; allowed: readonly AutomationStudioActionConsequence[] }
  | { kind: "refused"; evidence: JsonObject & { code: string } };

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
  /** The control as the gate carries it to a person: `name` is null where it was withheld. `item`, `dialog`, `subject` and `page` are the domain's opaque tokens (t475, t719). */
  control: { name: string | null; kind: string | null } & AutomationStudioSiteResetSpot;
  verb: string;
};

/** One exploration call that ran, as the build's permission wrapper tells the ledger. */
export type AutomationStudioSiteResetExplored = {
  callId: string;
  toolId: string;
  /** Registered operation that landed; repeated effects are grouped only on the same control and source. */
  operation?: string;
  /** The act this call undoes, when its claim was read as an undo. */
  undoes?: string;
  /** The last action the domain put to the gate for this call; absent when it put none. */
  declared?: AutomationStudioSiteResetDeclared;
  /** The call applied an effect and did not answer `ok: false`. */
  landed: boolean;
  /** For an undo, why its control was admitted (`AutomationStudioSiteResetTarget`). */
  on?: Extract<AutomationStudioSiteResetTarget, { kind: "admit" }>["on"];
  /** The `resetDestination` ref the call named: where its own act's effect would show or, under `undoes`, the named act's; the ledger keeps it (F1). */
  resetDestination?: string;
};

/** The ledger, as the build's permission wrapper sees it. */
export type AutomationStudioSiteResetCalls = {
  /** A builder-only recoverable precondition, independent of lasting-act permission. */
  createBaseline?(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown): { kind: "admit" } | { kind: "refused"; evidence: JsonObject & { code: string } };
  destinationReceipts?(): Array<{ ref: string; ordinal: number; count: number }>;
  /** `resetDestination`: the ref the same call names, refused before it runs when no receipt printed it (rerun round 2); callers forward it. */
  claim(undoes: unknown, resetDestination?: unknown): AutomationStudioSiteResetClaim;
  /** Asked, for an undo, of each action the domain puts to the gate, before it acts (t475). */
  target(act: string, declared: { effect: AutomationStudioActionEffect; consequences: readonly AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot }): AutomationStudioSiteResetTarget;
  explored(call: AutomationStudioSiteResetExplored): void;
};

/**
 * One lasting act of this build as the model is shown it: its id, which
 * `undoes` names, what it did, and for an act made while exploring the call id
 * the model gave that call, so it can find the act in its own evidence.
 * `stillThere` is what the act changed on its own page that is still there,
 * in the domain's words, when the reset went back and looked (t471).
 * `possible`: it declared no lasting class but had an effect, so it is
 * possibly lasting and never asked for (`./ledger.ts`, t593).
 * `settle`: for an act still open, what to observe or undo so that it counts as
 * settled, in generic words naming only this run's refs and locations (L1).
 */
export type AutomationStudioSiteResetNamedAct = { act: string; did: string; call?: string; stillThere?: string[]; possible?: true; settle?: string };

/**
 * One act of this build no call can settle (t743, `gate_unsatisfiable`): its only witnesses are lists Core cannot read
 * again (`witness_unreachable`), or nothing can be named for it any more (`nothing_to_name`). It is never among the acts to
 * undo; it is listed apart under `actsUnsettleable` wherever those are answered, and trials stay refused while it is in
 * place (`./ledger.ts`, `unsatisfiable`).
 */
export type AutomationStudioSiteResetUnsettleableAct = { act: string; did: string; call?: string; reason: "gate_unsatisfiable"; failed: AutomationStudioSiteResetUnmet };

/**
 * One act a start hook took back (`absorbedByStartReset`), with what the act
 * log knows of how it was made (t647), for Core's own reading and never shown
 * to a model (each trial gate names an act by `act`, `did` and `call` alone):
 * `owner`, the brief whose ledger recorded it, where the ledger records for
 * one (`./project-ledger.ts`); `control`, the name of the control an
 * exploration call acted on, as the permission gate carried it, where it
 * carried one.
 */
export type AutomationStudioSiteResetAbsorbedAct = AutomationStudioSiteResetNamedAct & { owner?: string; control?: string };

/** One read of the target where it stands (`startState`): its opaque state, what differs from the state it was given, and where it was read. */
export type AutomationStudioSiteResetRead = {
  state: JsonObject;
  differs: string[];
  location?: string;
  lines?: AutomationStudioSiteResetLines;
  /** The opaque tokens of the items -- rows, cards -- on the page, in the same form a declaration's `control.item` takes (t475). */
  items?: string[];
  /** All subjects on this observed scope, including singleton and hidden records. */
  subjects?: string[];
  /** Positively complete, resource-bound collection inventories; only these can witness absence. */
  collections?: AutomationStudioSiteResetCollection[];
  scope?: string;
  /** Trusted opaque resource identity shared across locations; never a page-supplied id. */
  resource?: string;
  /**
   * The page's stateful controls (L1): for each control place on this page,
   * how many visible controls there show each state token. A place absent here
   * has no such control on this page now. Opaque tokens and counts only.
   */
  controls?: Record<string, Record<string, number>>;
};

/** A read, or why there is none: the domain has no `startState`, it answered nothing usable, or reading failed (kept on the start check as `failure`). */
export type AutomationStudioSiteResetReadAnswer = AutomationStudioSiteResetRead | { unread: "no_reader" | "no_answer" | "failed" };

/**
 * Where one act of this build happened (t471): the state of its page just
 * before it, where that page is, and what the act changed there, in the
 * domain's words. An undo counts only once those changes are gone from that
 * page; a call that names the act under `undoes` never counts it alone.
 */
export type AutomationStudioSiteResetPlace = {
  state: JsonObject;
  location: string;
  changed: string[];
  /** Immediate complete before/after evidence, never reconstructed during reset. */
  collections?: AutomationStudioSiteResetTrialActPlace["collections"];
  lines?: AutomationStudioSiteResetLines;
  /**
   * The items that were on its page after the act and not before it (t475):
   * the only items an undo of it may remove without asking. Absent when the
   * domain gives no items, or gave none before the act (t479: absence before is
   * known only from a read that listed the items), and then nothing is removed
   * unasked.
   */
  created?: string[];
};

/** What the reset may ask of the target before a trial (`./start-check.ts`). */
export type AutomationStudioSiteResetChecks = {
  /** Takes the target back to the build's start and says what differs there. */
  compare(): Promise<AutomationStudioSiteResetComparison>;
  /** Takes the target to `place` and says what differs from its state before the act; `differs` absent when that cannot be said. */
  compareAt?(place: AutomationStudioSiteResetPlace): Promise<AutomationStudioSiteResetComparison>;
  /**
   * Takes the target to `location` and reads it there; the read reaches every
   * ledger the way any read around a call does (L1: Core looks at an open act's
   * watched places itself before asking the model). Absent: Core never looks.
   */
  lookAt?(location: string): Promise<void>;
};

/**
 * What the start check found before a trial: whether taking the target back
 * to the build's start (the arrival) applied an effect, and what still
 * differs from how the build found it. `differs` is absent when the domain
 * could not say -- no start state, no arrival, or a failure -- and the
 * ledger alone decides.
 */
export type AutomationStudioSiteResetComparison = { moved: boolean; differs?: string[]; lines?: AutomationStudioSiteResetLines };

/**
 * The same differences as the lines themselves, when the domain gives them
 * (t471): those the earlier state had that are gone, and those that are new.
 * Opaque strings to Core, compared only for equality, so it can tell which act
 * changed which line -- a total two acts both changed is one line -- without
 * reading the domain's words.
 */
export type AutomationStudioSiteResetLines = { gone: string[]; added: string[] };

/**
 * The reset's answer before a trial: run it, saying under `startedWith` what
 * was still in place or different when it was admitted without a full reset;
 * or refuse it with the evidence the model is answered with. A refusal is not
 * a trial, and `moved` says whether the arrival applied an effect.
 *
 * `absorbedByStartReset` names each act of this build that was still on the
 * site when the deployment's start hook put it back (`startReset`, t504): the
 * hook, not the model, took it back, and the trial's evidence and the result
 * the build keeps say so rather than let the act vanish. Absent when the hook
 * took back nothing of the build, or no hook ran. It never changes whether the
 * trial is admitted.
 */
export type AutomationStudioSiteResetDecision =
  | { kind: "admit"; startedWith?: JsonObject; absorbedByStartReset?: AutomationStudioSiteResetAbsorbedAct[] }
  | { kind: "refuse"; evidence: JsonObject & { code: string }; moved: boolean };

/**
 * One lasting act a trial made, as the ledger reads it (`AutomationStudioCandidateTrialAct`, `../candidate/contracts.ts`).
 * `possible`: its step declared no lasting class but changed its own page, so it is possibly lasting (`./ledger.ts`, t593).
 * Where its step's control sat and the items it made, when the step's state diff said so (t598).
 */
export type AutomationStudioSiteResetTrialAct = {
  step: number;
  definitionId: string;
  label?: string;
  control?: string;
  consequences: readonly AutomationStudioActionConsequence[];
  possible?: true;
} & AutomationStudioSiteResetTrialActPlace;

/**
 * Where a trial step's act sat, and what it made (t598), read off that step's
 * own state diff (`../../service/candidate-trial/landed-acts.ts`), so an undo of
 * a trial's act is tied to its own item exactly as an explored act's is
 * (`./ledger.ts`, `target`): `spot` the item and dialog its control sat in,
 * `created` the items its own page showed after it that it had not shown
 * before. Absent where the diff said nothing of them; then no undo of it can
 * be tied to an item.
 */
export type AutomationStudioSiteResetTrialActPlace = {
  spot?: AutomationStudioSiteResetSpot;
  created?: string[];
  /** Domain-neutral opaque complete inventories captured immediately around this effect. */
  collections?: { before: NonNullable<AutomationStudioSiteResetRead["collections"]>; after: NonNullable<AutomationStudioSiteResetRead["collections"]> };
  /**
   * The step control's place (`spot.place`) as the page showed it just before and just after the step, and that page's scope (L1);
   * with the page's `location`, as a read carries it beside its `scope`, so a ledger that has read no page of it knows where to look.
   */
  controls?: { page: string; location?: string; before: Record<string, number>; after: Record<string, number> };
};

/**
 * How a trial's start was made (t475). `startReset`: the deployment's start
 * hook has just put the site back, before the check, so every act of this
 * build counts undone and the model is asked for nothing (t479); the acts it
 * took back are answered under `absorbedByStartReset` (t504).
 */
export type AutomationStudioSiteResetBeforeTrialOptions = { startReset?: boolean };

/** What the trial gate (`../candidate/trial-gate.ts`) is given: asked before each trial, and told what each trial left. */
export type AutomationStudioSiteResetTrialReset = {
  /**
   * Asked before each trial. `cannotUndo` names acts the model says the site
   * offers no way to undo (`core.test_candidate`'s own key): each one the reset
   * already asked for is kept, and the trial runs with it in place (t471).
   */
  beforeTrial(signal?: AbortSignal, cannotUndo?: readonly string[], options?: AutomationStudioSiteResetBeforeTrialOptions): Promise<AutomationStudioSiteResetDecision>;
  /** Restarts the reset phase and answers the acts now on the site, the trial's own among them (`leftOnSite`). */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[];
};
