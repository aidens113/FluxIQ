import type { ChatActivitySource, ChatFeedView } from "./activity-source.ts";

/** The host's feed as the chat's own: `start` hears it, `stop` stops hearing; the host's feed itself is never started or stopped here. */
export function createInjectedFeed(source: ChatActivitySource, onChange: () => void): ChatFeedView {
  let unsubscribe: (() => void) | undefined;
  return {
    snapshot: () => source.snapshot(),
    start() {
      unsubscribe ??= source.subscribe(onChange);
    },
    stop() {
      const stopped = unsubscribe;
      unsubscribe = undefined;
      stopped?.();
    },
    read: () => source.read()
  };
}
