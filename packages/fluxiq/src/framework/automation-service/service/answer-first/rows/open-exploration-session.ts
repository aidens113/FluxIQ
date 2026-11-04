import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";

/** An exploration's open session and the one way to end it. */
export type AutomationStudioAnswerFirstSession = {
  session: AutomationStudioRuntimeSession;
  /** Writes the session's end; the first call wins, so a later one writes nothing. */
  end(status: "succeeded" | "failed" | "cancelled"): Promise<void>;
};
