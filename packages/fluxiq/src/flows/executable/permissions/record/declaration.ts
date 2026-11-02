import type { AutomationStudioActionPermissionActionKind } from "../request/index.ts";
import type { AutomationStudioActionEffect } from "../declaration/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

/** One action, as the domain declared it and as Core answered it. */
export type AutomationStudioActionDeclarationRecord = {
  action: {
    kind: AutomationStudioActionPermissionActionKind;
    /** The tool the call named, or the node definition the step runs. */
    id: string;
    /** The call id, or the step's ref: what joins this record to the trace. */
    ref: string;
    verb: string;
    /** Whether taking it changes anything, as the domain stated it. */
    effect: AutomationStudioActionEffect;
  };
  /** The control as a person would name it, withheld when the model was never shown that name. */
  control: { name: string | null; kind: string | null };
  /** What the action said it would lastingly do, in Core's order. Empty is an answer. */
  consequences: AutomationStudioActionConsequence[];
  permitted: boolean;
  /** Present only on a refusal: what the run did not hold. */
  missing?: AutomationStudioActionConsequence[];
  /** Present only on a refusal that raised or reported a request. */
  requestId?: string;
  /**
   * Classes an *observing* action named, which Core did not treat as lasting.
   *
   * Kept rather than dropped, and this is the whole reason a read still goes to
   * the gate. The classes here are a model saying that reading a page creates
   * something, which is worth being able to see and count -- it is what a
   * build's guidance is measured by -- and it is also how a reader tells
   * "declared nothing" apart from "declared something that could not apply".
   */
  disregarded?: AutomationStudioActionConsequence[];
  /**
   * Present when the action undid a lasting act of this same build, naming
   * that act (t462). Such an action is the build putting the site back, not
   * part of what the person asked for, so the cross-check against the
   * instruction leaves it out (`cross-check.ts`).
   */
  undoes?: string;
};
