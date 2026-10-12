// The ledger of this build's own lasting acts (t462: a build resets the site
// before it re-runs its Flow; user, 2026-10-12).
//
// Candidate mode had no record of what a build left on the site: the draft
// steps that carry it exist only in legacy mode. So the build's permission
// wrapper (`../action-permissions.ts`) tells this ledger every exploration call
// it ran (`explored`), and the trial gate tells it each trial's own lasting
// acts (`trialRan`). Each becomes an act `act-N`, numbered once and never
// reused, which the model names under `undoes` on the `core.run_node` call
// that reverses it (`claim`).
//
// - An act is recorded only when it landed, was permitted, applied an effect
//   ("mutate") and declared a lasting class: `create_new`, `modify_existing` or
//   `delete`. One declaring `move_money` or `send_or_publish` cannot be undone
//   through the site, so it is recorded as such and never asked for.
// - A claim is accepted only for an act of the current phase: in place, or
//   undone since the last trial (a second try at the same undo). Undoing an act
//   that created something may remove it without asking (`allowed: ["delete"]`),
//   once: after it landed, a second try is gated as any call is, so the build
//   never removes more unasked than it created. Anything else is gated exactly
//   as any call is, so an act on what was there before the build began still
//   asks.
// - A phase runs from the build's start, or from one trial to the next. The
//   policy before a trial (`./trial-policy.ts`) reads it.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type {
  AutomationStudioSiteResetCalls,
  AutomationStudioSiteResetClaim,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetExplored,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetTrialAct
} from "./contracts.ts";
import { automationStudioSiteResetTrialPolicy, type AutomationStudioSiteResetPhase } from "./trial-policy.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The classes an act may leave that the site's own controls can reverse. */
const UNDOABLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);
/** The classes no control of the site takes back. */
const IRREVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["move_money", "send_or_publish"]);
/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`); no build comes near it, and past it nothing more is recorded. */
const MAX_ACT = 9999;

type Act = {
  id: string;
  did: string;
  /** The exploration call, or the trial step, that made it. */
  ref: string;
  /** The exploration call's id, as the model gave it; absent for a trial's act. */
  call?: string;
  created: boolean;
  undoable: boolean;
  undone: boolean;
  /** The phase in which it was last undone. */
  undonePhase?: number;
};

export class AutomationStudioSiteResetLedger implements AutomationStudioSiteResetCalls {
  private readonly acts: Act[] = [];
  private next = 1;
  private phaseNumber = 1;
  private phase: AutomationStudioSiteResetPhase = { recorded: 0, refusals: 0, startDiffersSent: false };

  claim(undoes: unknown): AutomationStudioSiteResetClaim {
    if (undoes === undefined) return { kind: "none" };
    const act = typeof undoes === "string" ? this.acts.find((entry) => entry.id === undoes) : undefined;
    if (!act || !this.claimable(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    return { kind: "undo", undo: { act: act.id, allowed: act.created && !act.undone ? ["delete"] : [] } };
  }

  explored(call: AutomationStudioSiteResetExplored): void {
    if (!call.landed) return;
    if (call.undoes !== undefined) {
      const act = this.acts.find((entry) => entry.id === call.undoes);
      if (act && this.claimable(act)) {
        act.undone = true;
        act.undonePhase = this.phaseNumber;
      }
      return;
    }
    const declared = call.declared;
    if (!declared?.permitted || declared.effect !== "mutate") return;
    const words = [declared.verb, declared.control.name === null ? "" : JSON.stringify(declared.control.name), declared.control.kind ?? ""];
    this.record(words.filter((word) => word.trim()).join(" ").trim(), call.callId, declared.consequences, call.callId);
  }

  /** The policy before a trial, applied to this phase; `compare` is asked only when a reset is due. */
  async beforeTrial(compare: () => Promise<AutomationStudioSiteResetComparison>): Promise<AutomationStudioSiteResetDecision> {
    const answer = await automationStudioSiteResetTrialPolicy({ phase: { ...this.phase }, inPlace: this.inPlace(), compare });
    if (answer.kind === "refuse") {
      this.phase = { ...this.phase, refusals: this.phase.refusals + 1, lastRefusal: answer.signature, startDiffersSent: this.phase.startDiffersSent || answer.startDiffers };
      return { kind: "refuse", evidence: answer.evidence, moved: answer.moved };
    }
    if (answer.allUndone) {
      for (const act of this.acts) {
        if (act.undoable && !act.undone) act.undone = true;
      }
    }
    return { kind: "admit", ...(answer.startedWith ? { startedWith: answer.startedWith } : {}) };
  }

  /** A trial ran: a new phase starts with what was still in place and the trial's own acts, which are answered as left on the site. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    this.phaseNumber += 1;
    this.phase = { recorded: 0, refusals: 0, startDiffersSent: false };
    for (const act of acts) {
      const label = act.label ? JSON.stringify(act.label) : act.definitionId;
      const did = `trial step ${act.step} ${label}${act.control ? ` on ${JSON.stringify(act.control)}` : ""}`;
      this.record(did, `${trialRunId ?? "trial"}#step-${act.step}`, act.consequences);
    }
    return this.inPlace();
  }

  /** This build's acts still in place that may be undone, as the model is shown them. */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => act.undoable && !act.undone).map((act) => ({ act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}) }));
  }

  private claimable(act: Act): boolean {
    return act.undoable && (!act.undone || act.undonePhase === this.phaseNumber);
  }

  private record(did: string, ref: string, consequences: readonly AutomationStudioActionConsequence[], call?: string): void {
    const lasting = consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
    if (!lasting || this.next > MAX_ACT) return;
    const undoable = !consequences.some((consequence) => IRREVERSIBLE.has(consequence));
    this.acts.push({ id: `act-${this.next}`, did: did || "an act", ref, ...(call ? { call } : {}), created: consequences.includes("create_new"), undoable, undone: false });
    this.next += 1;
    this.phase = { ...this.phase, recorded: this.phase.recorded + 1 };
  }
}
