// How the site-reset ledger answers a call under `undoes`: how its value reads
// (`claim`), whether its undo may act on the control the domain declared
// (`target`), and what one that ran did (`ran`). Moved whole out of
// `../site-reset/ledger.ts` (t797, no change in behaviour) with these header paragraphs;
// the ledger is a facade over this, `./answers.ts` and
// `./recording.ts`.
//
// **What an undo may name and act on** -- its own act's item, a positive
// identity match, one lasting press per confirmation, unasked removal only
// of what the act created, legacy refusals keeping an act -- and what an
// undo or a look under `undoes` that ran did to its act are judged by
// `../reset-undo/claims.ts` (t743: moved there with their header paragraphs).
//
// **Cross-page inverses need a destination baseline (t719 review).** A
// subject/title says which item an effect concerns; it never proves that the
// whole item belongs to the build. Before adding something whose removal will
// happen elsewhere, the build observes that destination. The domain supplies
// an opaque scope and its subject tokens, including singleton/hidden items.
// The ledger retains the first such read and the local act sequence. A
// subject-only deletion is admitted only for create_new when that scope was
// read before the act, the subject was absent then and is present now. It is
// unasked once, and the act settles as any act does (`./answers.ts`, L1). So is removing,
// on a destination the act named (its own or lent by the acts it repeats), a
// subject that list's original did not hold and its fresh read holds now, even
// where the domain names the item differently there than on the act's own
// page (t743, job): `target` hands the admission the lent destinations, and
// any unasked subject undo that lands is spent. Unproved quantity inverses stay
// refused; a changed page alone never marks a subject inverse complete. A
// project reset updates the act owner's current observation without
// manufacturing a baseline for a different brief's independent resource.
//
// A press that named no act but reversed one by its effect is paired with it
// there too (`pairOf`, `paired`, P4); `./recording.ts` asks once the read after
// the press, or its effect record, is in.
//
// An undo refusal and the acts listed apart beside it give one answer: where
// the ledger lists the refusal's own act apart, the refusal says no call can
// meet it and never lists it to undo (t797 P4, `../reset-answers/agreeing.ts`),
// checked again in `target` because the acts listed apart are added there after
// the refusal was built.

import { automationStudioSiteResetAnswerAgreeing as agreeing } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetClaim, AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetTarget, AutomationStudioSiteResetUnsettleableAct } from "../site-reset/index.ts";
import type { AutomationStudioSiteResetLedgerAct as Act } from "./act.ts";
import type { AutomationStudioSiteResetLedgerAnswers } from "./answers.ts";
import { automationStudioSiteResetLedgerNamedAct as namedAct } from "./named-act.ts";
import type { AutomationStudioSiteResetLedgerState } from "./state.ts";
import { AutomationStudioSiteResetUndoClaims, type AutomationStudioSiteResetUndoDeclared } from "../reset-undo/index.ts";

/** The ledger's answers to a call under `undoes`, over its shared state (header). */
export class AutomationStudioSiteResetLedgerClaims {
  /** What a call under `undoes` may name and act on, and what one that ran did (`../reset-undo/claims.ts`). */
  private readonly undos: AutomationStudioSiteResetUndoClaims;

  constructor(
    private readonly state: AutomationStudioSiteResetLedgerState,
    answers: AutomationStudioSiteResetLedgerAnswers,
    /** The ledger's own public answers, asked through the ledger (`../site-reset/ledger.ts`), and the recording's `locate` and `pressedUnder` (`./recording.ts`). */
    private readonly ports: {
      inPlace: () => AutomationStudioSiteResetNamedAct[];
      unsatisfiable: () => AutomationStudioSiteResetUnsettleableAct[];
      locate: (act: Act) => void;
      pressed: (place: string | undefined) => void;
    }
  ) {
    this.undos = new AutomationStudioSiteResetUndoClaims({
      acts: state.acts,
      seen: state.seen,
      receipts: state.createBaselines,
      claimable: (act) => answers.claimable(act),
      settledNow: (act) => answers.settledNow(act),
      toUndo: (act) => answers.toUndo(act),
      inPlace: () => ports.inPlace(),
      unsatisfiable: () => ports.unsatisfiable(),
      named: (act) => answers.named(act),
      plain: namedAct,
      toggle: (act) => state.judge.toggleOf(act),
      pressed: (place) => ports.pressed(place)
    });
  }

  /** How a call's `undoes` value reads (`../reset-undo/claims.ts`). */
  claim(undoes: unknown, resetDestination?: unknown): AutomationStudioSiteResetClaim {
    return this.undos.claim(undoes, resetDestination);
  }

  /** Whether an undo of `actId` may act on the control the domain declared, read before it acts (`../reset-undo/claims.ts`). */
  target(actId: string, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
    const act = this.state.acts.find((entry) => entry.id === actId);
    // The destinations its repeats lend it, as the settlement gathers them, for a removal on a destination it named (`../reset-undo/admission.ts`, t743).
    if (act) act.lent = this.state.judge.lent(act);
    const answer = this.undos.target(actId, declared);
    // A subject undo it was admitted on names a list it could change (`./recording.ts`, t751 R1).
    if (act && answer.kind === "admit") this.ports.locate(act);
    // The refusal follows the ledger's verdict on its own act, listed apart or not (header, t797 P4).
    return answer.kind === "refused" ? { ...answer, evidence: agreeing(answer.evidence) } : answer;
  }

  /** What an undo or a look under `undoes` that ran did to its act (`../reset-undo/claims.ts`). */
  ran(call: Parameters<AutomationStudioSiteResetUndoClaims["ran"]>[0]): void {
    this.undos.ran(call);
  }

  /** The one open act a press that named no act reverses, by its effect (`../reset-undo/claims.ts`, P4). */
  pairOf(by: Act, toggle: Parameters<AutomationStudioSiteResetUndoClaims["pairOf"]>[1]): Act | undefined {
    return this.undos.pairOf(by, toggle);
  }

  /** `by` recorded as an undo of `act`, paired by its effect (`../reset-undo/claims.ts`, P4). */
  paired(act: Act, by: Act): void {
    this.undos.paired(act, by);
  }
}
