// The chat's live activity, read from Core's `get-activity` for the project.
//
// Read when it may have moved, never on a timer: once when the first
// subscriber arrives, once each time the page's change stream opens or opens
// again (whatever happened while it was down), once per `activity` change the
// stream names for the project the chat is about, and once when the chat
// moves to another project (`followProject`). Reads never overlap: a reason
// to read that arrives during a read is served by one more read. A failed
// read keeps the last state and says it is not live; the next reason to read
// reads again. The state is the Studio's own: `current` and `recent` as
// Core's snapshot, `display` from the shared pacer with this panel's words,
// `history` held per unit of work. With no project to read, the state is an
// idle one and nothing is asked. There is no page overlay in the panel, so
// `overlay` is always `hidden` and `setOverlay` is absent.

import type { ChatActivityPort, ChatActivityState } from "@fluxiq/ui-components";
import { parseConversationActivitySnapshot } from "../../automation-studio/conversation/activity";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { sharedPanelChanges, type PanelChangesPort } from "../../panel-changes";
import { chatFailure } from "../transport/chat-failure";
import { createActivitySession, type ActivitySession } from "./activity-session";
import { browserActivityTimers } from "./browser-timers";
import type { ActivityTimers } from "./timers";

export type ProgramActivityPortOptions = {
  projectId(): string | undefined;
  /** The clock and timers the paced status runs on; the browser's own when absent. */
  timers?: ActivityTimers;
  /** The page's change stream; the shared one when absent. */
  changes?: PanelChangesPort;
};

/** The activity port, and the one thing its host tells it: the chat moved to another thread, perhaps another project's. */
export type ProgramActivityPort = ChatActivityPort & {
  /** Reads now when the chat's project is not the one last read and someone listens. */
  followProject(): void;
};

const NO_ACTIVITY: ChatActivityState = { current: null, display: null, recent: [], overlay: "hidden", live: true };

export function createProgramActivityPort(api: ProgramCommandTransport, options: ProgramActivityPortOptions): ProgramActivityPort {
  const timers = options.timers ?? browserActivityTimers;
  const listeners = new Set<(state: unknown) => void>();
  let session: ActivitySession | null = null;
  let stopChanges: (() => void) | null = null;
  // Bumped on every start and stop, so a read begun under an earlier start is dropped.
  let generation = 0;
  let reading: number | undefined;
  let readAgain = false;
  let lastProject: string | undefined;

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
  const project = () => options.projectId()?.trim() || undefined;

  const read: ChatActivityPort["read"] = async () => {
    const projectId = project();
    // No project open and no thread chosen: there is no work to read, which is an idle chat and not a failed one.
    if (!projectId) return { ok: true, value: { state: NO_ACTIVITY } };
    const response = await api.post<unknown>("get-activity", { projectId });
    if (!response.ok) return chatFailure(response);
    // A read for a project the chat has left must not replace the new one's state.
    if (project() !== projectId) return { ok: false, code: "failed", sentence: "The project changed while FluxIQ was answering." };
    return { ok: true, value: { state: sessionFor(projectId).apply(parseConversationActivitySnapshot(response.payload)) } };
  };

  const readAndTell = async (started: number): Promise<void> => {
    reading = started;
    try {
      do {
        readAgain = false;
        lastProject = project();
        const result = await read();
        if (started !== generation) return;
        if (result.ok) tell(result.value.state as ChatActivityState);
        else tell(session?.markNotLive() ?? null);
      } while (readAgain);
    } finally {
      if (reading === started) reading = undefined;
    }
  };
  const refresh = (): void => {
    if (stopChanges === null) return;
    if (reading === generation) {
      readAgain = true;
      return;
    }
    void readAndTell(generation);
  };

  const start = (): void => {
    generation += 1;
    stopChanges = (options.changes ?? sharedPanelChanges()).subscribe({
      opened: refresh,
      activity: (projectId) => {
        if (projectId === project()) refresh();
      }
    });
    refresh();
  };
  const stop = (): void => {
    generation += 1;
    const stopping = stopChanges;
    stopChanges = null;
    stopping?.();
    reading = undefined;
    readAgain = false;
    session?.dispose();
    session = null;
  };

  return {
    read,
    subscribe(listener) {
      listeners.add(listener);
      if (stopChanges === null) start();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) stop();
      };
    },
    followProject() {
      if (project() !== lastProject) refresh();
    }
  };
}
