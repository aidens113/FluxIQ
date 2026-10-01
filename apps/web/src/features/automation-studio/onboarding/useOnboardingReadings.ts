"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OnboardingReading, OnboardingReadings, OnboardingSources } from "./types";

const LOADING: OnboardingReadings = { gateway: { status: "loading" }, keys: { status: "loading" } };

/** Current-source checks settle independently; unfinished automatic checks wait for completion. */
export function useOnboardingReadings(sources: OnboardingSources, options: { pollMs: number; isComplete(readings: OnboardingReadings): boolean }): { readings: OnboardingReadings; refresh(): void } {
  const ownerRef = useRef({ sources });
  if (ownerRef.current.sources !== sources) ownerRef.current = { sources };
  const owner = ownerRef.current;
  const [published, publish] = useState({ owner, readings: LOADING });
  const readings = published.owner === owner ? published.readings : LOADING;
  const currentOptions = useRef(options); currentOptions.current = options;
  const mounted = useRef(false);
  const refreshRef = useRef<(() => void) | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; refreshRef.current = null; scheduleRef.current = null; }; }, []);
  const refresh = useCallback(() => { if (mounted.current && ownerRef.current === owner) refreshRef.current?.(); }, [owner]);

  useEffect(() => {
    let alive = true;
    let pending = false;
    let generation = 0;
    let currentReadings = LOADING;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => alive && mounted.current && ownerRef.current === owner;
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      clearTimer();
      if (!current() || pending || hidden() || currentOptions.current.pollMs <= 0 || currentOptions.current.isComplete(currentReadings)) return;
      timer = setTimeout(check, currentOptions.current.pollMs);
    };
    const check = () => {
      if (!current() || pending) return;
      clearTimer(); pending = true; currentReadings = LOADING;
      const request = ++generation;
      publish({ owner, readings: currentReadings });
      const commit = <K extends keyof OnboardingReadings>(key: K, value: OnboardingReadings[K]) => {
        if (!current() || generation !== request) return;
        currentReadings = { ...currentReadings, [key]: value };
        publish({ owner, readings: currentReadings });
      };
      void Promise.all([
        settle(() => sources.loadGatewaySnapshot(), validGateway, "The FluxIQ runtime could not be reached.").then((value) => commit("gateway", value)),
        settle(async () => {
          const result = await sources.loadSecretKeys();
          return object(result) && result.ok === true
            ? { ok: true, payload: object(result.payload) ? result.payload.keys : undefined }
            : result;
        }, validKeys, "Your API keys could not be read.").then((value) => commit("keys", value))
      ]).then(() => {
        if (!current() || generation !== request) return;
        pending = false; schedule();
      });
    };
    const visibility = () => {
      clearTimer();
      if (!hidden() && currentOptions.current.pollMs > 0 && !currentOptions.current.isComplete(currentReadings)) check();
    };
    refreshRef.current = check; scheduleRef.current = schedule;
    documentOrNull()?.addEventListener("visibilitychange", visibility);
    check();
    return () => {
      alive = false; generation++; clearTimer();
      if (refreshRef.current === check) refreshRef.current = null;
      if (scheduleRef.current === schedule) scheduleRef.current = null;
      documentOrNull()?.removeEventListener("visibilitychange", visibility);
    };
  }, [sources, owner]);
  const complete = options.isComplete(readings);
  useEffect(() => { scheduleRef.current?.(); }, [options.pollMs, complete]);
  return { readings, refresh };
}

function documentOrNull() { return typeof document === "undefined" ? null : document; }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function optional(value: Record<string, unknown>, key: string, test: (value: unknown) => boolean) { return value[key] === undefined || test(value[key]); }
function timestamp(value: unknown) { return typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)); }

function validGateway(value: unknown): value is OnboardingReadings["gateway"] extends OnboardingReading<infer T> ? T : never {
  if (!object(value)) return false;
  if (!optional(value, "webRuntime", (runtime) => object(runtime) && optional(runtime, "clientGatewayListening", (v) => typeof v === "boolean") && optional(runtime, "clientGatewayError", (v) => typeof v === "string"))) return false;
  if (!optional(value, "sessions", (sessions) => Array.isArray(sessions) && sessions.every((session) => object(session) && typeof session.sessionId === "string"))) return false;
  return optional(value, "pairings", (pairings) => Array.isArray(pairings) && pairings.every((pairing) => object(pairing) && optional(pairing, "consumedAt", timestamp) && optional(pairing, "expiresAt", timestamp)));
}

function validKeys(value: unknown): value is OnboardingReadings["keys"] extends OnboardingReading<infer T> ? T : never {
  return Array.isArray(value) && value.every((key) => object(key) && typeof key.name === "string" && typeof key.kind === "string" && typeof key.scope === "string" && typeof key.enabled === "boolean" && optional(key, "provider", (v) => typeof v === "string") && optional(key, "scopeRef", (v) => typeof v === "string"));
}

async function settle<T>(request: () => Promise<unknown>, valid: (value: unknown) => value is T, fallbackError: string): Promise<OnboardingReading<T>> {
  try {
    const result = await request();
    if (object(result) && result.ok === true && valid(result.payload)) return { status: "loaded", value: result.payload };
    if (object(result) && result.ok === false && typeof result.error === "string" && result.error.trim()) return { status: "failed", error: result.error };
    return { status: "failed", error: fallbackError };
  } catch {
    return { status: "failed", error: fallbackError };
  }
}
