// A build record's `lastingActs` as merged acts (`runtime/project-agents/record/build-record.ts`).

import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, type AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import type { AutomationStudioProjectBuildLastingAct } from "../../../../project-agents/index.ts";
import type { AutomationStudioAttemptActMerged } from "../../contracts.ts";

const UNDO_WORDS = "Through the site's own controls";

/** Each act as landed, its classes and whether it can be undone with it: the record holds no settlement, so the ledger's state stands over this where both name one act. */
export function automationStudioAttemptActsFromBuildRecord(acts: readonly AutomationStudioProjectBuildLastingAct[]): AutomationStudioAttemptActMerged[] {
  return acts.map((act) => ({
    sourceId: act.act,
    what: act.description,
    classes: AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((known): known is AutomationStudioAttemptActClass => (act.consequences as readonly string[]).includes(known)),
    state: "landed",
    stage: "trial",
    ...(act.undoable ? { undo: { how: UNDO_WORDS } } : {})
  }));
}
