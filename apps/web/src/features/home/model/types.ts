// What the Home page shows, already in plain words. The sections draw these and nothing else.

/** One run, reduced to what Home needs. `costUsd` is absent when the engine did not record one. */
export type HomeRun = {
  runId: string;
  flowId: string;
  projectId: string;
  flowName: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  costUsd?: number;
};

/** One thread as Home reads it, for questions waiting on the person. */
export type HomeThread = {
  conversationId: string;
  projectId: string;
  subjectKind: string;
  subjectId: string;
  title?: string;
  pendingAskCount: number;
  status: string;
};

/** One connected client or host. */
export type HomeClient = {
  clientId: string;
  label: string;
  transport: string;
  status: string;
  lastSeenAt?: number;
};

export type HomeTone = "ok" | "warn" | "bad" | "neutral";
