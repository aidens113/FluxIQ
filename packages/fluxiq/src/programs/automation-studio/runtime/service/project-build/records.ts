import { AutomationStudioProjectBuildRecordStore } from "../../project-agents/index.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// The build record store of one project build (unit A5c): made once from the
// service's paths and shared by the run and its promotion, so a record kept in
// memory -- a service with no storage root -- is the same record both read.

const stores = new WeakMap<AutomationStudioProjectBuildPorts, AutomationStudioProjectBuildRecordStore>();

export function automationStudioProjectBuildRecords(project: AutomationStudioProjectBuildPorts): AutomationStudioProjectBuildRecordStore {
  const known = stores.get(project);
  if (known) return known;
  const store = new AutomationStudioProjectBuildRecordStore(project.paths.projects, project.paths.flows);
  stores.set(project, store);
  return store;
}
