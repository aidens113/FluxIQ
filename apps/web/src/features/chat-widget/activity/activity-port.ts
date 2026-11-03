// The chat's live activity, read from Core's `get-activity` for the project.
//
// Nothing pushes to this browser, so the port polls: `subscribe` starts a
// backoff poll (`createBackoffPoller`, the one the Studio's conversation uses:
// fast while Core's latest event is not its last, decaying while quiet, a slow
// beat while the tab is hidden, an immediate read when it shows again) and
// stops it when the last subscriber leaves. The state is the Studio's own:
// `current` and `recent` as Core's snapshot, `display` from the shared pacer
// with this panel's words, `history` held per unit of work. With no project to
// read, the state is an idle one and nothing is asked. There is no page
// overlay in the panel, so `overlay` is always `hidden` and `setOverlay` is
// absent.

import type { ChatActivityPort, ChatActivityState } from "@fluxiq/ui-components";
import { parseConversationActivitySnapshot } from "../../automation-studio/conversation/activity";
import { createBackoffPoller, type BackoffPoller } from "../../automation-studio/conversation/thread";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatFailure } from "../transport/chat-failure";
import { createActivitySession, type ActivitySession } from "./activity-session";
import { browserActivityTimers } from "./browser-timers";
import type { ActivityTimers } from "./timers";

export type ProgramActivityPortOptions = {
  projectId(): string | undefined;
  timers?: ActivityTimers;
};

const NO_ACTIVITY: ChatActivityState = { current: null, display: null, recent: [], overlay: "hidden", live: true };

export function createProgramActivityPort(api: ProgramCommandTransport, options: ProgramActivityPortOptions): ChatActivityPort {
  const timers = options.timers ?? browserActivityTimers;
  const listeners = new Set<(state: unknown) => void>();
  let session: ActivitySession | null = null;
  let poller: BackoffPoller | null = null;

  const tell = (state: ChatActivityState | null): void => {
    if (state === null) return;
    for (const listener of [...listeners]) listener(state);
  };
  const sessionFor = (projectId: string): ActivitySession => {
    if (session?.projectId !== projectId) {
      session?.dispose();
      session = createActivitySession(projectId, timers, tell);
    }
    return session;
  };

  const read: ChatActivityPort["read"] = async () => {
    const projectId = options.projectId()?.trim();
    // No project open and no thread chosen: there is no work to read, which is an idle chat and not a failed one.
    if (!projectId) return { ok: true, value: { state: NO_ACTIVITY } };
    const response = await api.post<unknown>("get-activity", { projectId });
    if (!response.ok) return chatFailure(response);
    // A read for a project the chat has left must not replace the new one's state.
    if (options.projectId()?.trim() !== projectId) return { ok: false, code: "failed", sentence: "The project changed while FluxIQ was answering." };
    return { ok: true, value: { state: sessionFor(projectId).apply(parseConversationActivitySnapshot(response.payload)) } };
  };

  const resume = (): void => {
    if (document.visibilityState === "visible") poller?.sync();
  };
  const startPolling = (): void => {
    poller = createBackoffPoller<unknown>({
      active: () => listeners.size > 0,
      hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
      run: async () => {
        const result = await read();
        if (!result.ok) {
          tell(session?.markNotLive() ?? null);
          return "failed";
        }
        const state = result.value.state as ChatActivityState;
        tell(state);
        return state.current !== null && state.current.final !== true ? "pending" : "idle";
      },
      schedule: (callback, delayMs) => timers.setTimeout(callback, delayMs),
      cancel: (timer) => timers.clearTimeout(timer)
    });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
    poller.sync();
  };
  const stopPolling = (): void => {
    poller?.dispose();
    poller = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
    session?.dispose();
    session = null;
  };

  return {
    read,
    subscribe(listener) {
      listeners.add(listener);
      if (poller === null) startPolling();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopPolling();
      };
    }
  };
}
