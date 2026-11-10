import type { ConversationOnScreen } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import type { PanelConversationOptions } from "./panel-conversation-port";
import type { ActivityTimers } from "../activity";

/** What `createProgramChatTransport` needs besides the Studio's own transport. */
export type ProgramChatTransportOptions = {
  /**
   * The project the chat is about, asked at each request so a project change
   * needs no new transport. It follows the thread on screen, which may belong
   * to any project the person can see; undefined when no project is open and
   * no thread is chosen, and then nothing project-scoped is read.
   */
  projectId(): string | undefined;
  /**
   * The Secret Keys program's transport, for whether a model key is enabled.
   * Absent, the chat has no `models` port and never claims a key is missing.
   */
  secretKeys?: ProgramCommandTransport;
  /** What the panel has open, asked at each send and each confirmed run so "run it" means the Flow on screen. */
  onScreen?(): ConversationOnScreen;
  /** The clock and timers the activity poll runs on; the browser's own when absent. */
  activityTimers?: ActivityTimers;
  /** Present: this chat is the panel-wide thread, and its conversation goes to the panel assistant's endpoints. */
  panel?: PanelConversationOptions;
};
