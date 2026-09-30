// The request for a project's live activity: what FluxIQ is doing now and the
// events just before it, read from the process's activity hub
// (`runtime/activity/`). The answer is the hub's snapshot as is, so what the
// panel reads and what a paired client is pushed cannot drift.

import type { FlowProjectRequest } from "./flow.ts";

/** One project's live activity. Nothing else narrows it: the hub keeps one project's latest events. */
export type ActivityReadRequest = FlowProjectRequest;
