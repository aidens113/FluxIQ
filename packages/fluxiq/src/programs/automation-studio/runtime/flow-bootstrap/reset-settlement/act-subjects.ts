// What one act was about (t719): its `subject`, and its `page` where it sat in
// no item. The one source (t750) for the settlement's group witnesses
// (`./act-groups.ts`), the undo admission's "about the act" match
// (`../site-reset/undo-admission.ts`) and the undo reach's subjects
// (`../site-reset/undo-reach.ts`). It lives here because site-reset depends on
// this directory and never the other way. Opaque tokens, compared only for
// equality. Pure.

import type { AutomationStudioSiteResetSettlementSpot } from "./spot.ts";

/** The subjects an act sat on `spot` was about (header): its subject, and its page where it sat in no item. */
export function automationStudioSiteResetActSubjects(spot: AutomationStudioSiteResetSettlementSpot | undefined): string[] {
  const { subject, page, item } = spot ?? {};
  return [subject, ...(item === undefined ? [page] : [])].filter((entry): entry is string => entry !== undefined);
}
