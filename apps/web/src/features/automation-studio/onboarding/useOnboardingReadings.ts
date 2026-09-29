"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnboardingReading, OnboardingReadings, OnboardingSources } from "./types";

const LOADING: OnboardingReadings = { gateway: { status: "loading" }, keys: { status: "loading" } };

/**
 * Reads both onboarding sources, and re-reads them every `pollMs` until the
 * caller's `isComplete` says the checklist is done (`pollMs` of 0 never re-reads). A
 * failed read is kept as a failure with its message.
 */
export function useOnboardingReadings(sources: OnboardingSources, options: { pollMs: number; isComplete(readings: OnboardingReadings): boolean }): { readings: OnboardingReadings; refresh(): void } {
  const [readings, setReadings] = useState<OnboardingReadings>(LOADING);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      settle(sources.loadGatewaySnapshot(), "The FluxIQ runtime could not be reached."),
      settle(sources.loadSecretKeys().then((result) => result.ok ? { ok: true as const, payload: result.payload?.keys ?? [] } : { ok: false as const, error: result.error ?? "" }), "Your API keys could not be read.")
    ]).then(([gateway, keys]) => {
      if (!cancelled) setReadings({ gateway, keys });
    });
    return () => { cancelled = true; };
  }, [sources, revision]);

  const complete = options.isComplete(readings);
  useEffect(() => {
    if (!options.pollMs || complete) return;
    const timer = setInterval(refresh, options.pollMs);
    return () => clearInterval(timer);
  }, [options.pollMs, complete, refresh]);

  return { readings, refresh };
}

async function settle<T>(request: Promise<{ ok: boolean; payload?: T; error?: string }>, fallbackError: string): Promise<OnboardingReading<T>> {
  try {
    const result = await request;
    if (result.ok && result.payload !== undefined) return { status: "loaded", value: result.payload };
    return { status: "failed", error: result.error || fallbackError };
  } catch (error) {
    return { status: "failed", error: `${fallbackError} ${error instanceof Error ? error.message : String(error)}` };
  }
}
