import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioRunController } from "../index.ts";

function controller(options: { signal?: AbortSignal; maxPausedMs?: number } = {}) {
  let clock = 1_000;
  const run = new AutomationStudioRunController({ projectId: "project.one", runId: "run.one", now: () => clock, ...options });
  return { run, advance: (ms: number) => { clock += ms; } };
}

describe("a live run's pause, takeover and resume", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("lets an unpaused run straight through, with no promise to await", () => {
    const { run } = controller();
    expect(run.checkpoint({ nodeId: "a", step: 0 })).toBeNull();
    expect(run.snapshot()).toMatchObject({ state: "running", holder: null, lastNodeId: "a" });
  });

  it("holds at the next checkpoint, never before it, and resumes at the node it held before", async () => {
    const { run } = controller();
    expect(run.pause({ reason: "  Checking the page.  " })).toMatchObject({ state: "pause_requested", holder: "fluxiq", reason: "Checking the page." });
    const held = run.checkpoint({ nodeId: "b", step: 3 });
    expect(held).not.toBeNull();
    expect(run.snapshot()).toMatchObject({ state: "paused", nodeId: "b", step: 3, pausedAt: 1_000 });

    let released: unknown;
    void held!.then((outcome) => { released = outcome; });
    await Promise.resolve();
    expect(released).toBeUndefined();

    expect(run.resume()).toMatchObject({ state: "running", holder: null });
    expect(await held).toEqual({ outcome: "resume", afterManualAction: false });
    expect(run.snapshot().history.map((event) => event.kind)).toEqual(["pause_requested", "paused", "resumed"]);
    expect(run.snapshot().history[2]).toMatchObject({ nodeId: "b", afterManualAction: false });
  });

  it("hands the page to a person on takeover, and records a manual action on Continue", async () => {
    const { run } = controller();
    run.pause();
    const held = run.checkpoint({ nodeId: "login", step: 1 })!;
    expect(run.pause({ holder: "person", reason: "Solve the CAPTCHA." })).toMatchObject({ state: "paused", holder: "person", reason: "Solve the CAPTCHA." });
    // A plain pause never takes the page back from a person.
    expect(run.pause()).toMatchObject({ holder: "person" });
    run.resume({ afterManualAction: true, note: "Solved it." });
    expect(await held).toEqual({ outcome: "resume", afterManualAction: true });
    expect(run.snapshot().history.at(-1)).toMatchObject({ kind: "resumed", nodeId: "login", afterManualAction: true, note: "Solved it." });
  });

  it("withdraws a pause resumed before the run reached a checkpoint", () => {
    const { run } = controller();
    run.pause();
    run.resume();
    expect(run.checkpoint({ nodeId: "a", step: 0 })).toBeNull();
    expect(run.snapshot().state).toBe("running");
  });

  it("lets a held run go as stopped when the run is cancelled", async () => {
    const abort = new AbortController();
    const { run } = controller({ signal: abort.signal });
    run.pause();
    const held = run.checkpoint({ nodeId: "a", step: 2 })!;
    abort.abort("Stopped by the person.");
    expect(await held).toEqual({ outcome: "stop", message: "Run cancelled while it was paused." });
    expect(run.snapshot().history.at(-1)).toMatchObject({ kind: "stopped_while_paused", nodeId: "a" });
    // A cancelled run cannot be paused again.
    expect(run.pause().state).toBe("running");
  });

  it("stops a run held past its limit rather than holding its browser and admission forever", async () => {
    vi.useFakeTimers();
    const { run, advance } = controller({ maxPausedMs: 60_000 });
    run.pause();
    const held = run.checkpoint({ nodeId: "a", step: 0 })!;
    expect(run.snapshot().expiresAt).toBe(61_000);
    advance(60_000);
    vi.advanceTimersByTime(60_000);
    expect(await held).toEqual({ outcome: "stop", message: "The run was stopped because it stayed paused for more than 1 minute." });
    expect(run.snapshot().history.at(-1)).toMatchObject({ kind: "expired", pausedMs: 60_000 });
  });

  it("lets a held run go as stopped when the run is disposed", async () => {
    const { run } = controller();
    run.pause();
    const held = run.checkpoint({ nodeId: "a", step: 0 })!;
    expect(run.dispose().state).toBe("running");
    expect(await held).toMatchObject({ outcome: "stop" });
  });

  it("reports adapting while recovery works", () => {
    const { run } = controller();
    run.setPhase("adapting");
    expect(run.snapshot().phase).toBe("adapting");
  });
});
