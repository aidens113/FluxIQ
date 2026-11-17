// A host's own activity feed, offered to the chat instead of a second one.

import type { ActivityFeed, ActivityFeedSnapshot } from "./activity-feed.ts";

/**
 * The feed a host already runs (`createActivityFeed`), as the chat hears it. The host
 * starts and stops its feed; the chat reads `snapshot()`, asks for a `read()` when it
 * starts, and re-renders on each call of a `subscribe`d listener (the host calls its
 * listeners from the `onChange` it gave `createActivityFeed`). `subscribe` answers an
 * unsubscribe.
 */
export type ChatActivitySource = {
  snapshot(): ActivityFeedSnapshot;
  read(): Promise<void>;
  subscribe(listener: () => void): () => void;
};

/** What the chat uses of a feed, whether it started it or the host did. */
export type ChatFeedView = Pick<ActivityFeed, "snapshot" | "start" | "stop" | "read">;
