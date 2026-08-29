import type { JsonObject } from "../../programs/program-api";

export type RecordingJsonObject = JsonObject;

export type RecordingApiResult<T = unknown> = {
  ok: boolean;
  payload?: T;
  error?: string;
};

export type RecordingApi = {
  post<T = unknown>(action: string, body: Record<string, unknown>): Promise<RecordingApiResult<T>>;
};

export type RecordingPageQuery = {
  projectId: string;
  limit: number;
  offset: number;
};

export type RecordingRepairRequest = {
  projectId: string;
  recordingId: string;
  authorizationPin: string;
};

export type RecordingViewDataPort = {
  queryPage(input: RecordingPageQuery): Promise<RecordingApiResult<{
    recordings?: unknown[];
    page?: { limit: number; offset: number; total: number };
  }>>;
  repairStateIndex(input: RecordingRepairRequest): Promise<RecordingApiResult>;
};