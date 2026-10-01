import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useOperationalSnapshot } from "../useOperationalSnapshot";
import type { ApiResponse } from "../../program-api";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Payload = { revision: number };
const valid = (value: unknown): value is Payload => Boolean(value && typeof value === "object" && typeof (value as Payload).revision === "number");
const success = (revision: number) => ({ ok: true, status: 200, payload: { revision } });
let view: ReturnType<typeof useOperationalSnapshot<Payload>>;
let renderer: ReactTestRenderer | undefined;
let visibility: EventTarget & { visibilityState: string };
const read = vi.fn<(signal: AbortSignal) => Promise<ApiResponse<Payload>>>();
let owner: object;
function Harness({ identity = owner, reader = read, beforePassive }: { identity?: object; reader?: typeof read; beforePassive?: () => void }) {
  view = useOperationalSnapshot({ owner: identity, read: reader, validate: valid });
  useLayoutEffect(() => { beforePassive?.(); }, [beforePassive]);
  return null;
}
const mount = async () => { await act(async () => { renderer = create(<Harness />); }); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const visible = async (state: string) => { await act(async () => { visibility.visibilityState = state; visibility.dispatchEvent(new Event("visibilitychange")); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  visibility = Object.assign(new EventTarget(), { visibilityState: "visible" }); vi.stubGlobal("document", visibility);
  owner = {}; read.mockReset().mockResolvedValue(success(1));
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

it("polls ten seconds after completion and coalesces manual reads", async () => {
  let resolve!: (value: ApiResponse<Payload>) => void;
  read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await mount();
  await advance(20_000);
  act(() => { void view.refresh(); void view.refresh(); });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(success(2)); });
  await advance(9999); expect(read).toHaveBeenCalledTimes(1);
  await advance(1); expect(read).toHaveBeenCalledTimes(2);
});

it("pauses and aborts hidden reads, freezes its clock, resumes once and ignores the aborted result", async () => {
  await mount();
  let resolve!: (value: ApiResponse<Payload>) => void;
  read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await act(async () => { void view.refresh(); });
  const signal = read.mock.calls[1]![0];
  await visible("hidden"); const stopped = view.nowMs;
  expect(signal.aborted).toBe(true); expect(view.paused).toBe(true); expect(view.stale).toBe(true);
  await advance(100_000); expect(view.nowMs).toBe(stopped); expect(read).toHaveBeenCalledTimes(2);
  read.mockResolvedValue(success(3)); await visible("visible");
  expect(read).toHaveBeenCalledTimes(3); expect(view.data?.revision).toBe(3);
  await act(async () => { resolve(success(99)); }); expect(view.data?.revision).toBe(3);
});

it("retains the last success, uses capped failure backoff and never exposes server error text", async () => {
  await mount(); const confirmed = view.lastSuccessAt;
  read.mockResolvedValue({ ok: false, status: 500, payload: { revision: 99 }, error: "secret-server-text" } as ApiResponse<Payload>);
  await advance(10_000); expect(view.data?.revision).toBe(1); expect(view.lastSuccessAt).toBe(confirmed);
  expect(view.stale).toBe(true); expect(view.error).not.toContain("secret-server-text");
  await advance(19_999); expect(read).toHaveBeenCalledTimes(2);
  await advance(1); expect(read).toHaveBeenCalledTimes(3);
  await advance(40_000); expect(read).toHaveBeenCalledTimes(4);
  await advance(60_000); expect(read).toHaveBeenCalledTimes(5);
  await advance(60_000); expect(read).toHaveBeenCalledTimes(6);
});

it("stops automatic 403 retries including visibility resume until manual recovery", async () => {
  read.mockResolvedValue({ ok: false, status: 403, payload: null } as unknown as ApiResponse<Payload>);
  await mount(); await advance(120_000); await visible("hidden"); await visible("visible");
  expect(read).toHaveBeenCalledTimes(1); expect(view.error).toContain("permission");
  read.mockResolvedValue(success(2)); await act(async () => { await view.refresh(); });
  expect(view.error).toBe(""); await advance(10_000); expect(read).toHaveBeenCalledTimes(3);
});

it("rejects malformed payloads and synchronous failures without wedging later retries", async () => {
  read.mockImplementationOnce(() => { throw new Error("private exception"); });
  await mount(); expect(view.loading).toBe(false); expect(view.error).not.toContain("private");
  read.mockResolvedValueOnce({ ok: true, status: 200, payload: {} } as ApiResponse<Payload>);
  await act(async () => { await view.refresh(); }); expect(view.data).toBe(null);
  await act(async () => { await view.refresh(); }); expect(view.data?.revision).toBe(1);
});

it("fences replaced owner responses, captured refresh callbacks and unmounted work", async () => {
  let resolve!: (value: ApiResponse<Payload>) => void;
  read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await mount(); const oldRefresh = view.refresh; const oldSignal = read.mock.calls[0]![0];
  const replacement = vi.fn<typeof read>().mockResolvedValue(success(2));
  await act(async () => { renderer!.update(<Harness identity={{}} reader={replacement} />); });
  expect(oldSignal.aborted).toBe(true); expect(view.data?.revision).toBe(2);
  await act(async () => { resolve(success(99)); await oldRefresh(); });
  expect(view.data?.revision).toBe(2); expect(replacement).toHaveBeenCalledTimes(1);
  const currentRefresh = view.refresh; act(() => renderer!.unmount()); renderer = undefined;
  await currentRefresh(); await advance(60_000); expect(replacement).toHaveBeenCalledTimes(1);
});

for (const cancellation of ["hidden", "unmount"] as const) it(`does not start a read canceled by ${cancellation} before its first microtask`, async () => {
  act(() => { renderer = create(<Harness />); });
  if (cancellation === "hidden") act(() => { visibility.visibilityState = "hidden"; visibility.dispatchEvent(new Event("visibilitychange")); });
  else { act(() => renderer!.unmount()); renderer = undefined; }
  await act(async () => { await Promise.resolve(); });
  expect(read).not.toHaveBeenCalled();
});

it("rejects a captured old refresh during a replacement commit before passive cleanup", async () => {
  await mount(); const previous = view.refresh;
  const replacement = vi.fn<typeof read>().mockResolvedValue(success(2));
  let beforeCleanupCalls = -1;
  await act(async () => {
    renderer!.update(<Harness identity={{}} reader={replacement} beforePassive={() => {
      const oldTimerCount = vi.getTimerCount();
      void previous(); beforeCleanupCalls = read.mock.calls.length;
      expect(vi.getTimerCount()).toBe(oldTimerCount);
    }} />);
  });
  expect(beforeCleanupCalls).toBe(1); expect(read).toHaveBeenCalledTimes(1);
  expect(replacement).toHaveBeenCalledTimes(1); expect(view.data?.revision).toBe(2);
});
