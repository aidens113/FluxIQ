import type {
  AutomationStudioConversationSignal,
  AutomationStudioConversationSignalListener,
  AutomationStudioConversationSignalScope,
  AutomationStudioConversationSignalSink,
  AutomationStudioConversationSignalsPort
} from "./types.ts";

/** What a failing listener is reported as: its error's name only, never a thread's words. */
function reportListenerFailure(error: unknown): void {
  console.error("conversation_signal.listener_failed", error instanceof Error ? error.name : "non_error");
}

/**
 * Tells listeners, in this process, that a thread changed, so a reader learns
 * of a turn a run wrote by push instead of reading the thread on a timer.
 *
 * The writers call `signal` once a write has committed (the conversations
 * collaborator for a project's threads, `PanelAssistantThreads` for a
 * person's), so a listener that reads the thread at once reads the change.
 * Delivery is synchronous and in order; a listener that throws is reported and
 * the others still hear it.
 *
 * In-process only. Several processes serving one workspace need a shared
 * signal (hosted follow-up 7); each would otherwise hear only its own writes.
 */
export class AutomationStudioConversationSignalHub implements AutomationStudioConversationSignalsPort, AutomationStudioConversationSignalSink {
  private readonly listeners = new Set<AutomationStudioConversationSignalListener>();
  private readonly onListenerFailed: (error: unknown) => void;
  private current = 0;

  constructor(options: { onListenerFailed?: (error: unknown) => void } = {}) {
    this.onListenerFailed = options.onListenerFailed ?? reportListenerFailure;
  }

  signal(scope: AutomationStudioConversationSignalScope, conversationId: string): void {
    this.current += 1;
    const given: AutomationStudioConversationSignal = Object.freeze({ scope: Object.freeze({ ...scope }), conversationId, version: this.current });
    for (const listener of [...this.listeners]) {
      try {
        listener(given);
      } catch (error) {
        this.onListenerFailed(error);
      }
    }
  }

  subscribe(listener: AutomationStudioConversationSignalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  version(): number {
    return this.current;
  }
}
