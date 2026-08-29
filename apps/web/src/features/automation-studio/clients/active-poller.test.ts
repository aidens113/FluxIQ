import { describe, expect, it, vi } from "vitest";
import { createActivePoller } from "./active-poller";

describe("createActivePoller", () => {
  it("runs only while active, cancels scheduled work on deactivation, and stays stopped after dispose", async () => {
    let active = false;
    let scheduled: (() => void) | undefined;
    const run = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn();
    const poller = createActivePoller({
      active: () => active,
      run,
      schedule: (callback) => {
        scheduled = callback;
        return 7;
      },
      cancel,
      delayMs: 5_000
    });

    poller.sync();
    expect(run).not.toHaveBeenCalled();

    active = true;
    poller.sync();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduled).toBeTypeOf("function");

    active = false;
    poller.sync();
    expect(cancel).toHaveBeenCalledWith(7);
    scheduled?.();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    active = true;
    poller.dispose();
    poller.sync();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not schedule again when deactivated during an in-flight poll", async () => {
    let active = true;
    let finish: (() => void) | undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    const schedule = vi.fn(() => 9);
    const poller = createActivePoller({
      active: () => active,
      run,
      schedule,
      cancel: vi.fn(),
      delayMs: 5_000
    });

    poller.sync();
    expect(run).toHaveBeenCalledTimes(1);
    active = false;
    poller.sync();
    finish?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(schedule).not.toHaveBeenCalled();
    poller.dispose();
  });});