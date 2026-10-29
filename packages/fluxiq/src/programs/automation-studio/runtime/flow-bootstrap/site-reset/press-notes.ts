// A press that named a ref showing nothing of its change (t791 fix 3). The exploration door admits a lasting press with
// no witness (t775), and a `resetDestination` that `destination()` answers none for -- read in another tab, not where the
// press's effect would show, or already holding what the press made -- was dropped without a word, so the builder
// believed the press had a witness it did not. Now the press that landed carries a note saying the ref cannot show its
// change and the press has no witness. A note rides on the call (`AutomationStudioSiteResetExplored.note`), which the
// permission wrapper puts beside the tool's answer. Generic: no site is named.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetAdmissionDeclared } from "../reset-admission/index.ts";
import type { AutomationStudioSiteResetExplored } from "./contracts.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The classes the site's own controls can reverse: the presses that may need a witness. */
const REVERSIBLE: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

export class AutomationStudioSitePressNotes {
  private readonly unreaching = new Set<string>();

  constructor(private readonly known: { unissued(reference: unknown): boolean }) {}

  /**
   * The exploration door answered a press: remembers the ref it named when the press was admitted with no witness although
   * the ref is one this build was shown, so the ref showed nothing of the press's change. `witnessed`: the door found one.
   */
  asked(declared: AutomationStudioSiteResetAdmissionDeclared, reference: unknown, witnessed: boolean): void {
    if (witnessed || typeof reference !== "string" || this.known.unissued(reference)) return;
    if (declared.effect !== "mutate" || declared.consequences.length === 0 || !declared.consequences.every((consequence) => REVERSIBLE.has(consequence))) return;
    this.unreaching.add(reference);
  }

  /** The note a call that has run is given, if its press landed naming such a ref (header); what was remembered is forgotten either way. */
  taken(call: Pick<AutomationStudioSiteResetExplored, "landed" | "undoes" | "declared" | "resetDestination">): JsonObject | undefined {
    const ref = call.resetDestination;
    const had = ref !== undefined && this.unreaching.has(ref);
    this.unreaching.clear();
    if (!had || call.undoes !== undefined || !call.landed || call.declared?.permitted !== true || call.declared.effect !== "mutate") return undefined;
    return { ref, instruction: WORDS.destinationUnreaching(ref) };
  }
}
