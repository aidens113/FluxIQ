import { describe, expect, it } from "vitest";
import { AutomationStudioBuildCancellation } from "../cancellation.ts";

describe("cooperative build cancellation", () => {
  it("inherits a cancelled run and never dispatches its repair build", async () => {
    const control = new AutomationStudioBuildCancellation(), parent = new AbortController();
    parent.abort(); let calls = 0;
    await expect(control.run("p", "f", async () => { calls++; }, parent.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
  });
  it("registers before dispatch and refuses a cancelled queued callback", async () => {
    const control = new AutomationStudioBuildCancellation();
    let release!: () => void;
    let calls = 0;
    const result = control.run("p", "f", async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      control.checkpoint(); calls++;
    });
    expect(control.cancel("other", "f")).toBe(false);
    expect(control.cancel("p", "f")).toBe(true);
    release();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
    expect(control.cancel("p", "f")).toBe(false);
  });

  it("aborts a pending operation and refuses an ignored late result", async () => {
    const control = new AutomationStudioBuildCancellation();
    let release!: () => void;
    let signal!: AbortSignal;
    const result = control.run("p", "f", async () => {
      signal = control.signal()!;
      await new Promise<void>((resolve) => { release = resolve; });
      return "late yes";
    });
    control.cancel("p", "f");
    expect(signal.aborted).toBe(true);
    release();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels every queued build for the target without affecting another Flow", async () => {
    const control = new AutomationStudioBuildCancellation();
    const releases: Array<() => void> = [];
    const build = (flow: string) => control.run("p", flow, async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      control.checkpoint();
      return flow;
    });
    const one = build("f"), two = build("f"), other = build("other");
    expect(control.cancel("p", "f")).toBe(true);
    releases.forEach((release) => release());
    await expect(one).rejects.toMatchObject({ name: "AbortError" });
    await expect(two).rejects.toMatchObject({ name: "AbortError" });
    await expect(other).resolves.toBe("other");
    expect(control.signal()).toBeUndefined();
  });
});

// The project supervisor's build and the builders it dispatches (t534): the
// parent's abort reaches every child, a child ending never aborts its parent or
// a sibling, and cancelling the Flow aborts the whole tree.
describe("a build's tree of child scopes", () => {
  const held = (): { released: Promise<void>; release: () => void } => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    return { released, release };
  };

  it("opens only inside a running build", async () => {
    const control = new AutomationStudioBuildCancellation();
    await expect(control.child(async () => "orphan")).rejects.toThrow(/only inside a running build/);
  });

  it("gives each child its own signal under the parent's, and restores the parent's after", async () => {
    const control = new AutomationStudioBuildCancellation();
    await control.run("p", "f", async () => {
      const parent = control.signal();
      const inner = await control.child(async () => control.signal());
      expect(inner).toBeDefined();
      expect(inner).not.toBe(parent);
      expect(control.signal()).toBe(parent);
    });
  });

  it("aborts every child, and a child's child, when the parent is aborted", async () => {
    const control = new AutomationStudioBuildCancellation();
    const parentStop = new AbortController();
    const gate = held();
    const signals: AbortSignal[] = [];
    const run = control.run("p", "f", async () => await Promise.allSettled([
      control.child(async () => {
        signals.push(control.signal()!);
        await control.child(async () => {
          signals.push(control.signal()!);
          await gate.released;
          control.checkpoint();
        });
      }),
      control.child(async () => {
        signals.push(control.signal()!);
        await gate.released;
        control.checkpoint();
      })
    ]), parentStop.signal);
    await Promise.resolve();
    parentStop.abort();
    gate.release();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("never aborts the parent or a sibling when one child is stopped, fails or finishes", async () => {
    const control = new AutomationStudioBuildCancellation();
    const stopOne = new AbortController();
    const gate = held();
    const outcome = await control.run("p", "f", async () => {
      const stopped = control.child(async () => {
        await gate.released;
        control.checkpoint();
        return "stopped child went on";
      }, stopOne.signal);
      const failed = control.child(async () => { throw new Error("blocked: the brief could not be done"); });
      const sibling = control.child(async () => {
        await gate.released;
        control.checkpoint();
        return "sibling done";
      });
      stopOne.abort();
      gate.release();
      const settled = await Promise.allSettled([stopped, failed, sibling, control.child(async () => "quick")]);
      control.checkpoint();
      return { settled, parentAborted: control.signal()!.aborted };
    });
    expect(outcome.parentAborted).toBe(false);
    expect(outcome.settled[0]).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
    expect(outcome.settled[1]).toMatchObject({ status: "rejected", reason: { message: "blocked: the brief could not be done" } });
    expect(outcome.settled[2]).toEqual({ status: "fulfilled", value: "sibling done" });
    expect(outcome.settled[3]).toEqual({ status: "fulfilled", value: "quick" });
  });

  it("aborts the whole tree when the Flow is cancelled, and leaves another Flow's tree alone", async () => {
    const control = new AutomationStudioBuildCancellation();
    const gate = held();
    const signals: AbortSignal[] = [];
    const tree = (flowId: string) => control.run("p", flowId, async () => {
      signals.push(control.signal()!);
      return await control.child(async () => {
        signals.push(control.signal()!);
        await gate.released;
        control.checkpoint();
        return flowId;
      });
    });
    const cancelled = tree("f");
    const other = tree("other");
    await Promise.resolve();
    expect(control.cancel("p", "f")).toBe(true);
    gate.release();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await expect(other).resolves.toBe("other");
    expect(signals.filter((signal) => signal.aborted)).toHaveLength(2);
    expect(control.cancel("p", "f")).toBe(false);
  });
});
