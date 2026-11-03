import type { AutomationStudioProjectBuildActOwner } from "./act-owner.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

/**
 * One lasting act of the build, as the project ledger recorded it
 * (`flow-bootstrap/site-reset/project-ledger.ts`): its id, unique across the
 * build; what it did; who made it; every lasting class it declared, whether or
 * not its brief was permitted it (the person's own instruction can permit an
 * act too); and whether the site's own controls can undo it.
 */
export type AutomationStudioProjectBuildLastingAct = {
  recordedAt: number;
  act: string;
  owner: AutomationStudioProjectBuildActOwner;
  consequences: AutomationStudioActionConsequence[];
  description: string;
  undoable: boolean;
};
