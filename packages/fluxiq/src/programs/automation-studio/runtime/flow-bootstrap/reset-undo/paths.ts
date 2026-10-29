// The act's side of each path on which an undo of it may be admitted (t750):
// what the act must be for `./admission.ts` to admit an undo on that path,
// whatever control the undo would act on. The one source of these gates. The
// admission checks a path's gate here, then the control's own conditions;
// `./reach.ts` reads the same gates to say which paths an act still has
// when it decides that no undo could ever put back what the act's lists show
// (t748, `no_admissible_undo`). Before t750 the reach copied them and a test
// pinned the admission's lines; a gate widened or narrowed here now changes
// both at once, and a new admission path's act gate belongs here too, so the
// reach can read it.
//
// What stays in each caller: the control's conditions and the classes an undo
// declares (`./admission.ts`, with the named condition each one fails),
// and the reads that rule a path out for good (`./reach.ts`). The own
// toggle is the ledger's (`toggle`), not an act field, and is read by each.
// What an act was about, which the `subject` paths match on, is the
// settlement's (`../reset-settlement/act-subjects.ts`): both callers read it
// there, as the settlement's group witnesses do.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetOriginal } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetSpot } from "../site-reset/index.ts";

/** What the gates read of one act: the fields both the admission's act and the ledger's act carry. */
type Act = {
  strictReset: boolean;
  consequences: readonly AutomationStudioActionConsequence[];
  createdItems: readonly string[];
  destinations: ReadonlyArray<{ scope: string }>;
  spot?: AutomationStudioSiteResetSpot | undefined;
  chain?: "own" | "created" | undefined;
  transfer?: object | undefined;
  value?: object | undefined;
};

/** The classes after which a removal on a destination the act named is admitted (t743). */
const CHANGED: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing"]);

/** The act's side of each undo admission path (header). */
export const AUTOMATION_STUDIO_SITE_RESET_UNDO_PATHS = {
  /** `follow_up`: an undo of it landed on its own item or one it created, so the site's one confirmation dialog may follow. */
  followUp(act: Act): boolean {
    return act.chain !== undefined;
  },
  /** `subject` by a witnessed transfer: the act moved a subject between lists, and may be moved back. */
  transfer<A extends Act>(act: A): act is A & { transfer: NonNullable<A["transfer"]> } {
    return act.transfer !== undefined;
  },
  /** `created`: the items a legacy act's undo may delete by their token; none for a strict act, whose created items need the subject proof. */
  createdItems(act: Act): readonly string[] {
    return act.strictReset ? [] : act.createdItems;
  },
  /** `own`: the act sat in an item it did not create, so a press on that same item may undo it. */
  ownItem(act: Act): boolean {
    const item = act.spot?.item;
    return item !== undefined && !act.createdItems.includes(item);
  },
  /** Both removals: the list's original was read before the act, the `sequence`-th of the ledger (1-based). */
  readBefore(original: AutomationStudioSiteResetOriginal | undefined, sequence: number): original is AutomationStudioSiteResetOriginal {
    return original !== undefined && original.beforeAct < sequence;
  },
  /** `subject`, the subject deletion (t719): an act that created something. */
  deletesCreated(act: Act): boolean {
    return act.consequences.includes("create_new");
  },
  /** `subject`, the removal on a destination (t743): a strict act that created or changed something. */
  removesOnDestination(act: Act): boolean {
    return act.strictReset && act.consequences.some((consequence) => CHANGED.has(consequence));
  },
  /** `own` and `step` by a value (t772): the act is witnessed by the shown values its press replaced (`../reset-settlement/judge.ts`). */
  valued(act: Act): boolean {
    return act.value !== undefined;
  },
  /** `own` by a value (t772): the act's own control has every token a press on it is told apart by -- resource, page, place and state. */
  ownControl(act: Act): boolean {
    const spot = act.spot;
    return spot?.resource !== undefined && spot.scope !== undefined && spot.place !== undefined && spot.state !== undefined;
  },
  /** The removal on a destination (t743): `scope` is a list the act named, or one the explored acts it repeats lend it (`lent`). */
  named(act: Act, lent: ReadonlyArray<{ scope: string }> | undefined, scope: string): boolean {
    return [...act.destinations, ...(lent ?? [])].some((entry) => entry.scope === scope);
  }
};
