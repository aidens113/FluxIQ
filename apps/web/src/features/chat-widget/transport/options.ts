import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import type { ActivityTimers } from "../activity";

/** What `createProgramChatTransport` needs besides the Studio's own transport. */
export type ProgramChatTransportOptions = {
  /** The project the chat is about, asked at each request so a project change needs no new transport. */
  projectId(): string | undefined;
  /**
   * The Secret Keys program's transport, for whether a model key is enabled.
   * Absent, the chat has no `models` port and never claims a key is missing.
   */
  secretKeys?: ProgramCommandTransport;
  /** The clock and timers the activity poll runs on; the browser's own when absent. */
  activityTimers?: ActivityTimers;
};
