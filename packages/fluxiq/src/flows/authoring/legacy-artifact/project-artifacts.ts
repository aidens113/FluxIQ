import type { AutomationStudioTaskArtifact } from "./index.ts";
import type { AutomationStudioRoutineArtifact } from "./index.ts";
import type { AutomationStudioConfigArtifact } from "./index.ts";
import type { AutomationStudioFlowDocument } from "./index.ts";

export type AutomationStudioProjectArtifacts = {
  tasks: AutomationStudioTaskArtifact[];
  routines: AutomationStudioRoutineArtifact[];
  configs: AutomationStudioConfigArtifact[];
  flows: AutomationStudioFlowDocument[];
};
