import type { AutomationStudioConversationSignalScope, AutomationStudioConversationSignalsPort } from "fluxiq/automation";
import type { PanelChangeTopic } from "./types";

/**
 * Thread changes as a topic: a change naming the thread each time Core signals
 * one this caller may read (`AutomationStudioConversations.signals`).
 *
 * `mayRead` decides the caller's authority over where the thread lives -- a
 * project's threads as `get-conversation` is decided, a person's panel thread
 * only for that person -- and answers false for a thread the caller may not
 * read, which is then never mentioned. It rejects only when authority could
 * not be decided, and that fails the stream: a signal silently dropped would
 * leave the person's thread stale, and a reconnect makes the browser read
 * again.
 */
export function conversationChangeTopic(signals: AutomationStudioConversationSignalsPort, mayRead: (scope: AutomationStudioConversationSignalScope) => Promise<boolean>): PanelChangeTopic {
  return {
    start(sink) {
      let stopped = false;
      const unsubscribe = signals.subscribe((signal) => {
        if (stopped) return;
        mayRead(signal.scope).then(
          (allowed) => {
            if (!stopped && allowed) sink.changed({ topic: "conversation", conversationId: signal.conversationId });
          },
          (error: unknown) => {
            /* best-effort: once stopped, no reader remains to tell */
            if (!stopped) sink.fail(error);
          }
        );
      });
      return () => {
        stopped = true;
        unsubscribe();
      };
    }
  };
}
