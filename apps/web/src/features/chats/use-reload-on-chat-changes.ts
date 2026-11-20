"use client";

import { useEffect } from "react";
import { sharedPanelChanges, type PanelChangesPort } from "../panel-changes";

/**
 * Calls `reload` whenever the panel's change stream says a conversation changed
 * (a new chat, a turn written, a status moved) or that a change may have been
 * missed (the stream opened again). It rides the page's one shared stream; no
 * timer. The `opened` told at once on subscribing is skipped: the page has just read.
 */
export function useReloadOnChatChanges(reload: () => void, changes: PanelChangesPort = sharedPanelChanges()): void {
  useEffect(() => {
    let subscribing = true;
    const stop = changes.subscribe({
      conversation: () => reload(),
      opened: () => {
        if (!subscribing) reload();
      }
    });
    subscribing = false;
    return stop;
  }, [changes, reload]);
}
