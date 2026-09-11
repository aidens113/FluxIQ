import type { FlowProjectRequest } from "./flow.ts";

export type FlowRunDetailRequest = FlowProjectRequest & {
  runId: string;
  compact?: boolean;
};

export type FlowRunActionPageRequest = FlowProjectRequest & {
  runId: string;
  limit?: unknown;
  offset?: unknown;
  cursor?: string | null;
};

export type FlowRunEventPageRequest = FlowProjectRequest & {
  runId: string;
  afterSequence?: unknown;
  cursor?: string | null;
  limit?: unknown;
};

export type RuntimeSessionControlRequest = FlowProjectRequest & {
  runId: string;
  reason?: string;
};
