// Covers own-project-activity.ts: only the activity of projects this instance's catalogue lists reaches its gateway,
// each id is read once and in publish order, a removed project is read again, and a catalogue that cannot be read
// drops that activity rather than guessing.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { AutomationStudioHeldProjects } from "../../../../../framework/automation-service/service/projects/index.ts";
import { relayOwnProjectActivity } from "../index.ts";

/** A hub, a catalogue and a removal feed the test drives, and what reached the gateway. */
function relayParts(listed: Set<string>) {
  const listeners: Array<(activity: ClientGatewayActivity) => void> = [];
  const removalListeners: Array<(projectId: string) => void> = [];
  const reads: string[] = [];
  const pending: Array<() => void> = [];
  const published: string[] = [];
  let failing = false;
  const stop = relayOwnProjectActivity({
    hub: {
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      }
    },
    projects: new AutomationStudioHeldProjects({
      lists: async (projectId) => {
        reads.push(projectId);
        await new Promise<void>((resolve) => pending.push(resolve));
        if (failing) throw new Error("catalogue unreadable");
        return listed.has(projectId);
      },
      removals: {
        subscribe: (listener) => {
          removalListeners.push(listener);
          return () => undefined;
        }
      }
    }),
    publish: (activity) => published.push(`${activity.subject.projectId}#${activity.sequence}`)
  });
  return {
    emit: (projectId: string, sequence: number) => { for (const listener of [...listeners]) listener(activity(projectId, sequence)); },
    release: async () => {
      while (pending.length > 0) pending.shift()?.();
      for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
    },
    remove: (projectId: string) => { for (const listener of removalListeners) listener(projectId); },
    fail: (value: boolean) => { failing = value; },
    listeners, reads, published, stop
  };
}

describe("the activity relay of one instance", () => {
  it("hands on its own projects' activity in order, reading each id once, and never another instance's", async () => {
    const parts = relayParts(new Set(["project.own"]));

    parts.emit("project.own", 1);
    parts.emit("project.foreign", 2);
    parts.emit("project.own", 3);
    expect(parts.published).toEqual([]);
    await parts.release();
    parts.emit("project.own", 4);
    parts.emit("project.foreign", 5);

    expect(parts.published).toEqual(["project.own#1", "project.own#3", "project.own#4"]);
    expect(parts.reads).toEqual(["project.own", "project.foreign"]);
  });

  it("reads a removed project again and finds it gone", async () => {
    const listed = new Set(["project.own"]);
    const parts = relayParts(listed);
    parts.emit("project.own", 1);
    await parts.release();

    listed.delete("project.own");
    parts.remove("project.own");
    parts.emit("project.own", 2);
    await parts.release();

    expect(parts.published).toEqual(["project.own#1"]);
    expect(parts.reads).toEqual(["project.own", "project.own"]);
  });

  it("drops activity whose catalogue could not be read, and reads that id again next time", async () => {
    const parts = relayParts(new Set(["project.own"]));
    parts.fail(true);
    parts.emit("project.own", 1);
    await parts.release();
    parts.fail(false);
    parts.emit("project.own", 2);
    await parts.release();

    expect(parts.published).toEqual(["project.own#2"]);
    expect(parts.reads).toEqual(["project.own", "project.own"]);
  });

  it("stops listening when stopped", () => {
    const parts = relayParts(new Set());
    parts.stop();
    expect(parts.listeners).toHaveLength(0);
  });
});

function activity(projectId: string, sequence: number): ClientGatewayActivity {
  return { activityId: "build.1", sequence, subject: { kind: "build", id: "build.1", projectId }, phase: "running", label: "Running", at: "2026-11-17T00:00:00.000Z" };
}
