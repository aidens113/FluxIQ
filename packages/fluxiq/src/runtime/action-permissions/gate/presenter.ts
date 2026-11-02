import type { AutomationStudioActionPermissionActionKind, AutomationStudioActionPermissionStage } from "../../../flows/executable/permissions/index.ts";
import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";

export type ActionPermissionPresenter = (input: { stage: AutomationStudioActionPermissionStage; kind: AutomationStudioActionPermissionActionKind; verb: string; controlName: string | null; controlKind: string | null; missing: readonly AutomationStudioActionConsequence[] }) => string;
