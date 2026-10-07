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
