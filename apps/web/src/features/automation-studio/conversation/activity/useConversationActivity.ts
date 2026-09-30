"use client";

// Reading a project's live activity for the chat: the latest event, and the
// events held for the rows.
//
// It rides the thread's own backoff poller (`thread/poller.ts`), which is what
// keeps the view awake while it is visible without a fixed interval: a fast
// beat while Core's latest event is not its last, the ordinary decay once it
// is, the slow hidden beat while the tab or the surface is hidden, and an
// immediate read when the tab becomes visible again.
//
// A failed read changes nothing on screen. The header keeps saying what Core
// last said rather than guessing at what it might be saying now.

import { useEffect, useRef, useState } from "react";
import type { ConversationCommands } from "../conversation-host";
import { createBackoffPoller } from "../thread";
import type { ConversationActivity } from "./contracts";
import { conversationActivityPollOutcome, mergeConversationActivity } from "./model";

export type ConversationActivityState = {
  /** Core's latest event for the project, or null before it has said anything. */
  current: ConversationActivity | null;
  /** Every event held, oldest first; the rows are the ones with a detail. */
  events: ConversationActivity[];
};

export function useConversationActivity(input: {
  projectId: string | null;
  commands: Pick<ConversationCommands, "loadActivity">;
  /** False while the surface is collapsed: the poll drops to the hidden beat. */
  active?: boolean;
}): ConversationActivityState {
  const { projectId } = input;
  const load = input.commands.loadActivity;
  const active = input.active !== false;
  const [state, setState] = useState<ConversationActivityState>({ current: null, events: [] });
  const heldRef = useRef<ConversationActivity[]>([]);

  useEffect(() => {
    heldRef.current = [];
    setState({ current: null, events: [] });
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined" || !projectId || !load) return;
    let disposed = false;
    const poller = createBackoffPoller<number>({
      active: () => !disposed,
      hidden: () => !active || (typeof document !== "undefined" && document.visibilityState === "hidden"),
      run: async () => {
        const result = await load({ projectId });
        if (disposed || result.aborted) return "idle";
        if (!result.ok || !result.snapshot) return "failed";
        const events = mergeConversationActivity(heldRef.current, result.snapshot);
        heldRef.current = events;
        setState({ current: result.snapshot.current, events });
        return conversationActivityPollOutcome(result.snapshot);
      },
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (timer) => window.clearTimeout(timer)
    });
    poller.sync();
    const resume = () => {
      if (document.visibilityState === "visible") poller.sync();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", resume);
      poller.dispose();
    };
  }, [active, load, projectId]);

  return state;
}
