// The build record: the product's working document for one project build,
// persisted under the Flow's directory as the build proceeds.
//
// The supervisor owns one main file. Each brief's return is its own file, as
// each worker here writes its own report, so builders running at the same time
// never write the same file. Receipts stay with their candidate owner; the
// record holds references.

/** Which build a call is about. */
export type AutomationStudioProjectBuildRef = { projectId: string; flowId: string; buildId: string };
