// The table that routes a minted environment enrolment ticket to the tenant
// whose gateway minted it: unknown and expired tickets route nowhere, a newer
// ticket ends the one before, and every route's hold is released exactly once.

import { describe, expect, it } from "vitest";
import { ENVIRONMENT_HOST_ID_PREFIX, EnvironmentEnrolmentRoutes, environmentHostId, environmentOfHost } from "../index.ts";

type Timer = { run(): void; delayMs: number; cancelled: boolean };

function clocked(): { routes: EnvironmentEnrolmentRoutes; timers: Timer[]; at(ms: number): void } {
  let now = 1_000;
  const timers: Timer[] = [];
  const routes = new EnvironmentEnrolmentRoutes({
    now: () => now,
    schedule: (run, delayMs) => {
      const timer: Timer = { run, delayMs, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    }
  });
  return { routes, timers, at: (ms) => { now = ms; } };
}

function route(workspaceId: string, environmentId: string): { workspaceId: string; environmentId: string; release(): void; released: number } {
  const value = { workspaceId, environmentId, released: 0, release: () => { value.released += 1; } };
  return value;
}

describe("environment enrolment routes", () => {
  it("routes a registered ticket to its minting workspace without consuming it, and nothing else routes", () => {
    const { routes } = clocked();
    const minted = route("workspace-a", "env-a");
    routes.register("fxet_ticket-a", minted, 61_000);
    expect(routes.lookup("fxet_ticket-a")).toEqual({ workspaceId: "workspace-a", environmentId: "env-a" });
    // A replay reaches the same tenant, whose gateway refuses it as used.
    expect(routes.lookup("fxet_ticket-a")).toEqual({ workspaceId: "workspace-a", environmentId: "env-a" });
    expect(routes.lookup("fxet_forged")).toBeNull();
    expect(routes.lookup("")).toBeNull();
    expect(routes.lookup(undefined)).toBeNull();
    expect(minted.released).toBe(0);
  });

  it("ends an expired route on lookup and by its timer, releasing its hold once", () => {
    const { routes, timers, at } = clocked();
    const minted = route("workspace-a", "env-a");
    routes.register("fxet_ticket-a", minted, 61_000);
    expect(timers[0]?.delayMs).toBe(60_000);
    at(61_000);
    expect(routes.lookup("fxet_ticket-a")).toBeNull();
    expect(minted.released).toBe(1);
    timers[0]?.run();
    expect(minted.released).toBe(1);
    const second = route("workspace-a", "env-b");
    routes.register("fxet_ticket-b", second, 70_000);
    timers[1]?.run();
    expect(routes.lookup("fxet_ticket-b")).toBeNull();
    expect(second.released).toBe(1);
    expect(routes.size()).toBe(0);
  });

  it("keeps one routed ticket per environment and ends an environment's routes on revocation", () => {
    const { routes, timers } = clocked();
    const first = route("workspace-a", "env-a");
    const second = route("workspace-a", "env-a");
    const other = route("workspace-b", "env-b");
    routes.register("fxet_first", first, 61_000);
    routes.register("fxet_second", second, 61_000);
    routes.register("fxet_other", other, 61_000);
    expect(routes.lookup("fxet_first")).toBeNull();
    expect(first.released).toBe(1);
    expect(timers[0]?.cancelled).toBe(true);
    expect(routes.endForEnvironment("env-a")).toBe(1);
    expect(second.released).toBe(1);
    expect(routes.lookup("fxet_second")).toBeNull();
    expect(routes.lookup("fxet_other")).toEqual({ workspaceId: "workspace-b", environmentId: "env-b" });
    expect(other.released).toBe(0);
  });

  it("refuses a malformed route and releases its hold", () => {
    const { routes } = clocked();
    const bad = route(" workspace-a", "env-a");
    expect(() => routes.register("fxet_ticket", bad, 61_000)).toThrow(TypeError);
    expect(bad.released).toBe(1);
    expect(routes.size()).toBe(0);
  });
});

describe("environment host ids", () => {
  it("name exactly one environment and nothing else", () => {
    expect(environmentHostId("env-a")).toBe(`${ENVIRONMENT_HOST_ID_PREFIX}env-a`);
    expect(environmentOfHost(environmentHostId("env-a.1_b"))).toBe("env-a.1_b");
    expect(environmentOfHost("host-1")).toBeNull();
    expect(environmentOfHost(`${ENVIRONMENT_HOST_ID_PREFIX}`)).toBeNull();
    expect(environmentOfHost(`${ENVIRONMENT_HOST_ID_PREFIX}../escape`)).toBeNull();
    expect(environmentOfHost(`${ENVIRONMENT_HOST_ID_PREFIX}a:b`)).toBeNull();
    expect(environmentOfHost(42)).toBeNull();
    expect(() => environmentHostId("../escape")).toThrow(TypeError);
    expect(() => environmentHostId("")).toThrow(TypeError);
  });
});
