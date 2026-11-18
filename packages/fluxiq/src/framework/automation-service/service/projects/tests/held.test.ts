// Covers held.ts: which projects an instance holds is read once per id and shared by every asker, an id read as
// another's stays another's, a removal makes it read again (and voids a read already under way), and a read that
// failed is not remembered.
import { describe, expect, it } from "vitest";
import { AutomationStudioHeldProjects } from "../held.ts";

function holdings(listed: Set<string>) {
  const reads: string[] = [];
  const pending: Array<() => void> = [];
  const removed: Array<(projectId: string) => void> = [];
  let failing = false;
  const held = new AutomationStudioHeldProjects({
    lists: async (projectId) => {
      reads.push(projectId);
      await new Promise<void>((resolve) => pending.push(resolve));
      if (failing) throw new Error("catalogue unreadable");
      return listed.has(projectId);
    },
    removals: {
      subscribe: (listener) => {
        removed.push(listener);
        return () => undefined;
      }
    }
  });
  const release = async () => {
    while (pending.length > 0) pending.shift()?.();
    for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  const remove = (projectId: string) => {
    for (const listener of removed) listener(projectId);
  };
  const fail = (value: boolean) => {
    failing = value;
  };
  return { held, reads, release, remove, fail };
}

describe("AutomationStudioHeldProjects", () => {
  it("reads each id once for every asker, and remembers held and not held", async () => {
    const parts = holdings(new Set(["project.own"]));
    const answers = Promise.all([parts.held.holds("project.own"), parts.held.holds("project.own"), parts.held.holds("project.foreign")]);
    expect(parts.held.known("project.own")).toBeUndefined();
    await parts.release();
    expect(await answers).toEqual([true, true, false]);
    expect([parts.held.known("project.own"), parts.held.known("project.foreign")]).toEqual([true, false]);
    expect(await parts.held.holds("project.foreign")).toBe(false);
    expect(parts.reads).toEqual(["project.own", "project.foreign"]);
  });

  it("reads a removed project again, and does not record a read that a removal overtook", async () => {
    const listed = new Set(["project.own"]);
    const parts = holdings(listed);
    // The read answers from the catalogue as it stood when it began; the removal lands while it is under way.
    const first = parts.held.holds("project.own");
    parts.remove("project.own");
    await parts.release();
    expect(await first).toBe(true);
    listed.delete("project.own");
    expect(parts.held.known("project.own")).toBeUndefined();
    const again = parts.held.holds("project.own");
    await parts.release();
    expect(await again).toBe(false);
    expect(parts.reads).toEqual(["project.own", "project.own"]);
  });

  it("does not remember a read that failed", async () => {
    const parts = holdings(new Set(["project.own"]));
    parts.fail(true);
    const failed = parts.held.holds("project.own");
    await parts.release();
    await expect(failed).rejects.toThrow("catalogue unreadable");
    expect(parts.held.known("project.own")).toBeUndefined();
    parts.fail(false);
    const again = parts.held.holds("project.own");
    await parts.release();
    expect(await again).toBe(true);
  });
});
