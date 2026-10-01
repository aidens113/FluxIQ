"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "../program-api";

type Options<T> = {
  owner: object;
  read(signal: AbortSignal): Promise<ApiResponse<T>>;
  validate(value: unknown): value is T;
  clockMs?: number;
};
type State<T> = { owner: object; data: T | null; loading: boolean; error: string; paused: boolean; lastSuccessAt: number | null; nowMs: number };

/** Mount per operational program. The API seam owns retry/auth; this owns cadence. */
export function useOperationalSnapshot<T>(options: Options<T>) {
  const { owner, read, validate, clockMs } = options;
  const [state, setState] = useState<State<T>>({ owner, data: null, loading: true, error: "", paused: false, lastSuccessAt: null, nowMs: Date.now() });
  const runtimeRef = useRef<{ owner: object; read: Options<T>["read"]; refresh(): Promise<void> } | null>(null);
  const renderOwnerRef = useRef({ owner, read });
  renderOwnerRef.current = { owner, read };
  const refresh = useCallback(() => {
    const runtime = runtimeRef.current;
    return renderOwnerRef.current.owner === owner && renderOwnerRef.current.read === read && runtime?.owner === owner && runtime.read === read ? runtime.refresh() : Promise.resolve();
  }, [owner, read]);

  useEffect(() => {
    let active = true, generation = 0, failures = 0, denied = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let clock: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let pending: Promise<void> | null = null;
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const clearReadTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const update = (patch: Partial<State<T>>) => { if (active) setState((current) => ({ ...current, ...patch, owner })); };
    const queue = () => {
      clearReadTimer();
      if (!active || hidden() || denied) return;
      const delay = failures ? Math.min(60_000, 20_000 * 2 ** (failures - 1)) : 10_000;
      timer = setTimeout(() => { void run(); }, delay);
    };
    const run = (): Promise<void> => {
      if (!active || hidden()) return Promise.resolve();
      if (pending) return pending;
      clearReadTimer();
      const request = ++generation;
      const requestedController = new AbortController(); controller = requestedController;
      update({ loading: true, nowMs: Date.now() });
      const current = () => active && request === generation && !requestedController.signal.aborted;
      const operation = (async () => {
        try {
          await Promise.resolve();
          if (!current()) return;
          const result = await read(requestedController.signal);
          if (!current()) return;
          if (result.ok && validate(result.payload)) {
            failures = 0; denied = false;
            update({ data: result.payload, lastSuccessAt: Date.now(), nowMs: Date.now(), error: "" });
          } else {
            failures++; denied = result.status === 403;
            update({ nowMs: Date.now(), error: denied ? "You do not have permission to read this operational snapshot. Retry after access is restored." : "The operational snapshot could not be refreshed. Retry to check current state." });
          }
        } catch {
          if (current()) { failures++; update({ nowMs: Date.now(), error: "The operational snapshot could not be refreshed. Retry to check current state." }); }
        } finally {
          if (current()) { pending = null; update({ loading: false }); queue(); }
        }
      })();
      pending = operation;
      return operation;
    };
    const startClock = () => {
      if (clock !== undefined) clearTimeout(clock);
      clock = undefined;
      if (!active || hidden()) return;
      clock = setTimeout(() => { update({ nowMs: Date.now() }); startClock(); }, Math.max(1000, clockMs ?? 1000));
    };
    const visibility = () => {
      update({ paused: hidden(), nowMs: Date.now() });
      startClock();
      if (hidden()) {
        clearReadTimer(); ++generation; controller?.abort(); pending = null; update({ loading: false });
      } else if (!denied) { void run(); }
    };
    const runtime = { owner, read, refresh: () => { denied = false; return run(); } };
    runtimeRef.current = runtime;
    setState({ owner, data: null, loading: !hidden(), error: "", paused: hidden(), lastSuccessAt: null, nowMs: Date.now() });
    document.addEventListener("visibilitychange", visibility);
    startClock(); void run();
    return () => {
      active = false; ++generation; controller?.abort(); clearReadTimer(); if (clock !== undefined) clearTimeout(clock);
      document.removeEventListener("visibilitychange", visibility);
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [owner, read, validate, clockMs]);

  const currentOwner = state.owner === owner && runtimeRef.current?.read === read;
  const visible = currentOwner ? state : { owner, data: null, loading: true, error: "", paused: false, lastSuccessAt: null, nowMs: Date.now() };
  return { ...visible, refresh, stale: Boolean(visible.data && (visible.error || visible.paused || (visible.lastSuccessAt !== null && visible.nowMs - visible.lastSuccessAt >= 30_000))) };
}
