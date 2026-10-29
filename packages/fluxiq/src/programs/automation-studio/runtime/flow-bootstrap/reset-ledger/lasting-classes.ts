// The lasting classes the site-reset ledger records an act for, moved whole
// out of `../site-reset/ledger.ts` (t797, no change in behaviour): the recording
// (`./recording.ts`) reads both, the settlement answers
// (`./answers.ts`) whether an act is of a class no control takes back.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";

/** The classes an act may leave that the site's own controls can reverse. */
export const AUTOMATION_STUDIO_SITE_RESET_UNDOABLE_CLASSES: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);
/** The classes no control of the site takes back. */
export const AUTOMATION_STUDIO_SITE_RESET_IRREVERSIBLE_CLASSES: ReadonlySet<AutomationStudioActionConsequence> = new Set(["move_money", "send_or_publish"]);
