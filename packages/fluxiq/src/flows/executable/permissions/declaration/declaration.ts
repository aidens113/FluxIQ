import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioActionEffect } from "./effect.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../components/automation/action-effect/index.ts";

/**
 * One action, as the domain describes it before taking it.
 *
 * `control.name` is how a person would recognise the thing acted on -- the
 * words on it, as they appeared in evidence the model has already been shown.
 * It is never a locator, a fragment of markup or an internal id: Core carries
 * it to a person, and a name it cannot find in evidence already shown is
 * withheld rather than carried (see `gate.ts`). `control.kind` is one plain
 * word or two for what sort of thing it is, in the domain's own vocabulary.
 * `verb` is what the action does to it, as plainly: "press", "submit".
 *
 * `effect` is what the domain knows about the action itself rather than about
 * this page: `observe` for one that reads, waits or asserts, `mutate` for one
 * that acts. Absent is `mutate`, which gates as before.
 */
export type AutomationStudioActionDeclaration = {
  consequences: readonly AutomationStudioActionConsequence[];
  /**
   * `item` and `dialog` are optional opaque tokens for where the control sits:
   * the item -- a row, card or list item -- and the dialog, as the domain tells
   * two of them apart (t475). Core compares them only for equality, never
   * shows them, and reads them only to tie an undo of a build's own act to
   * that act's own item (`../flow-bootstrap/site-reset/`). Absent: the control
   * sits in no item, or in no dialog. A domain sends a digest, never the words.
   *
   * `subject` and `page`, opaque tokens of one kind, say what the control is
   * about -- its item's title, or for a control in no item the nearest titled
   * part of the page around it -- and what its page is about, its main heading
   * (t719). Read for the same one purpose: an act whose effect shows on another
   * page or in another list, such as an add from a detail page whose line
   * appears in a basket, is tied to its undo there by them. Absent where the
   * domain found none.
   *
   * `place` and `state` (L1 reset settlement) are the control's own slot on its
   * page and its own state there (name, pressed, checked, selected) just
   * before the action, as opaque digests: a toggle pressed by the build is
   * tied to the press that turns it back by them, and its state coming back
   * settles it. Absent where the domain gives none.
   */
  control: { name: string; kind?: string; item?: string; dialog?: string; subject?: string; page?: string; scope?: string; resource?: string; place?: string; state?: string };
  verb: string;
  effect?: AutomationStudioActionEffect;
  /** Resolved trusted client floor, separate from model-authored consequences. */
  actionEffect?: AutomationStudioResolvedActionEffect;
};
