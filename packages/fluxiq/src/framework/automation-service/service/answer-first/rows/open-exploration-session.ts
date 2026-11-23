import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";

/** An exploration's open session and the one way to end it. */
export type AutomationStudioAnswerFirstSession = {
  session: AutomationStudioRuntimeSession;
  /** This segment's actual start, also written to runtime_runs. */
  startedAt: number;
  /** The first segment's actual start; null when an old carried attempt has no truthful reference. */
  processingReferenceTimeMs: number | null;
  /** Writes the session's end; the first call wins, so a later one writes nothing. */
  end(status: "succeeded" | "failed" | "cancelled"): Promise<void>;
};
