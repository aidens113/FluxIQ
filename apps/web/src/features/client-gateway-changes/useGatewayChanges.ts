"use client";

import { useSyncExternalStore } from "react";
import { sharedGatewayChanges } from "./shared-subscription";
import type { GatewayChangeState } from "./types";

/**
 * Client gateway changes as a reader sees them: the latest snapshot payload,
 * whether the stream is live, and a revision that moves on each open and each
 * change. Every component calling it shares the page's one subscription.
 * `refresh` reads the snapshot now and re-opens a stream the browser gave up on.
 */
export function useGatewayChanges(): GatewayChangeState & { refresh: () => void } {
  const subscription = sharedGatewayChanges();
  const state = useSyncExternalStore(subscription.subscribe, subscription.getState, subscription.getInitialState);
  return { ...state, refresh: subscription.refresh };
}
