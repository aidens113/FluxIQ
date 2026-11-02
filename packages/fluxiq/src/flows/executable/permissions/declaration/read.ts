import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioActionEffect } from "./effect.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../components/automation/action-effect/index.ts";

/** A declaration after Core has read it: consequences deduplicated, text trimmed. */
export type AutomationStudioReadActionDeclaration = {
  consequences: AutomationStudioActionConsequence[];
  controlName: string;
  controlKind: string | null;
  /** The opaque item and dialog tokens the domain gave the control; null where it gave none. */
  controlItem: string | null;
  controlDialog: string | null;
  /** The opaque tokens of what the control and its page are about (t719); null where it gave none. */
  controlSubject: string | null;
  controlPage: string | null;
  controlScope: string | null;
  /** Trusted opaque resource identity, compared only inside builder reset preconditions. */
  controlResource: string | null;
  /** The control's own slot on its page and its state there before the action (L1); null where it gave none. */
  controlPlace: string | null;
  controlState: string | null;
  verb: string;
  /** Stated or, where the domain said nothing, `mutate`. */
  effect: AutomationStudioActionEffect;
  /** Present only when the client supplied a resolved floor. */
  actionEffect?: AutomationStudioResolvedActionEffect;
};
