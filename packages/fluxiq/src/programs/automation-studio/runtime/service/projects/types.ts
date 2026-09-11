import type { AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectHierarchy } from "../../../api/index.ts";

// A project as it is stored: the catalogue row plus the hierarchy documents
// that live beside it, and the shape of the index that lists them all.
export type AutomationStudioProjectRecord = AutomationStudioProject & AutomationStudioProjectHierarchy;

export type AutomationStudioProjectIndex = {
  categories: AutomationStudioProjectCategory[];
  projects: AutomationStudioProject[];
};
