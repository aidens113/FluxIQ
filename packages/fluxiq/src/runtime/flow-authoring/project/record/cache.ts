import type { AutomationStudioProjectRecordOwner } from "./owner.ts";
import { AutomationStudioProjectBuildRecordStore } from "./store.ts";

// The build record store of one project build (unit A5c): made once from the
// service's paths and shared by the run and its promotion, so a record kept in
// memory -- a service with no storage root -- is the same record both read.

const stores = new WeakMap<AutomationStudioProjectRecordOwner, AutomationStudioProjectBuildRecordStore>();

export function automationStudioProjectBuildRecords(project: AutomationStudioProjectRecordOwner): AutomationStudioProjectBuildRecordStore {
  const known = stores.get(project);
  if (known) return known;
  const store = new AutomationStudioProjectBuildRecordStore(project.paths.projects, project.paths.flows);
  stores.set(project, store);
  return store;
}
