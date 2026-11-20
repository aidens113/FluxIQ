import { describe, expect, it } from "vitest";
import { connectedGroups, NO_REVOKED, readRevokedAccess } from "../connected";
import { needsYouItems } from "../needs-you";
import { readClients } from "../read-clients";
import { readThreads } from "../read-threads";
import { agoText } from "../relative-time";
import { recentRuns } from "../recent-runs";
import { runDuration } from "../run-duration";
import { runResult } from "../run-result";
import { shapeRun } from "../shape-run";
import { todaySummary } from "../today-summary";
import type { HomeRun } from "../types";

const NOW = new Date(2026, 10, 10, 15, 0, 0).getTime();
const MIN = 60_000;

function run(over: Partial<HomeRun> & { runId: string }): HomeRun {
  return { flowId: "f1", projectId: "p1", flowName: "Cheapest listings", status: "succeeded", startedAt: NOW - MIN, ...over };
}

describe("agoText", () => {
  it("speaks in minutes, hours and days", () => {
    expect(agoText(NOW - 10_000, NOW)).toBe("just now");
    expect(agoText(NOW - 3 * MIN, NOW)).toBe("3 min ago");
    expect(agoText(NOW - 120 * MIN, NOW)).toBe("2 h ago");
    expect(agoText(NOW - 49 * 60 * MIN, NOW)).toBe("2 d ago");
    expect(agoText(undefined, NOW)).toBe("not known");
  });
});

describe("shapeRun", () => {
  const names = new Map([["f1", "Cheapest listings"]]);
  it("keeps what the engine gave and invents nothing", () => {
    expect(shapeRun({ runId: "r1", flowId: "f1", projectId: "p1", status: "succeeded", startedAt: 5, finishedAt: 9, tokenUsage: { estimatedCostUsd: 0.31 } }, names))
      .toEqual({ runId: "r1", flowId: "f1", projectId: "p1", flowName: "Cheapest listings", status: "succeeded", startedAt: 5, finishedAt: 9, costUsd: 0.31 });
    const bare = shapeRun({ runId: "r2", flowId: "gone", updatedAt: 7 }, names);
    expect(bare).toEqual({ runId: "r2", flowId: "gone", projectId: "", flowName: "A Flow", status: "unknown", startedAt: 7 });
    expect(bare && "costUsd" in bare).toBe(false);
  });
  it("drops rows it cannot link to", () => {
    expect(shapeRun({ flowId: "f1", startedAt: 1 }, names)).toBeUndefined();
    expect(shapeRun("nope", names)).toBeUndefined();
    expect(shapeRun({ runId: "r", flowId: "f1" }, names)).toBeUndefined();
  });
});

describe("todaySummary", () => {
  it("counts only today's runs and adds only recorded costs", () => {
    const yesterday = new Date(2026, 10, 9, 23, 0, 0).getTime();
    const summary = todaySummary([
      run({ runId: "a", costUsd: 0.25 }),
      run({ runId: "b", status: "failed", costUsd: 0.1 }),
      run({ runId: "c" }),
      run({ runId: "d", startedAt: yesterday, costUsd: 9 })
    ], NOW);
    expect(summary).toEqual({ runs: 3, passed: 2, failed: 1, spendUsd: 0.35 });
  });
  it("leaves spend out when no run recorded a cost", () => {
    expect(todaySummary([run({ runId: "a" })], NOW).spendUsd).toBeNull();
    expect(todaySummary([], NOW)).toEqual({ runs: 0, passed: 0, failed: 0, spendUsd: null });
  });
});

describe("recentRuns", () => {
  it("is newest first and at most ten", () => {
    const runs = Array.from({ length: 14 }, (_, i) => run({ runId: `r${i}`, startedAt: NOW - i * MIN }));
    const recent = recentRuns([...runs].reverse());
    expect(recent).toHaveLength(10);
    expect(recent[0]?.runId).toBe("r0");
  });
});

describe("runResult and runDuration", () => {
  it("names results in plain words", () => {
    expect(runResult("succeeded")).toEqual({ label: "Passed", tone: "ok" });
    expect(runResult("failed").tone).toBe("bad");
    expect(runResult("mystery").label).toBe("Unknown");
  });
  it("gives a duration only for finished runs", () => {
    expect(runDuration({ startedAt: 0, finishedAt: 42_000 })).toBe("42 s");
    expect(runDuration({ startedAt: 0, finishedAt: 5 * MIN })).toBe("5 min");
    expect(runDuration({ startedAt: 0 })).toBeUndefined();
  });
});

describe("clients", () => {
  it("reads a list or an object and puts connected ones first", () => {
    const clients = readClients([
      { clientId: "a", label: "Old browser", transport: "websocket", status: "offline", lastSeenAt: NOW - 3 * 24 * 60 * MIN },
      { clientId: "b", label: "Chrome extension", transport: "websocket", status: "ready", lastSeenAt: NOW - 4 * MIN },
      { label: "no id" }
    ]);
    expect(clients).toHaveLength(2);
    expect(readClients({ clients })).toEqual(clients);
    const { connected } = connectedGroups(clients, NO_REVOKED, NOW);
    expect(connected.map((row) => row.name)).toEqual(["Chrome extension", "Old browser"]);
    expect(connected[0]).toMatchObject({ state: "Online", lastSeen: "4 min ago" });
    expect(connected[1]).toMatchObject({ state: "Offline", lastSeen: "3 d ago" });
    expect(readClients(null)).toEqual([]);
  });
});

describe("needsYouItems", () => {
  const threads = readThreads({
    conversations: [
      { conversationId: "c1", projectId: "p1", subject: { kind: "flow", id: "f1" }, status: "open", pendingAskCount: 1, title: null },
      { conversationId: "c2", projectId: "p1", subject: { kind: "run", id: "r9" }, status: "open", pendingAskCount: 0 },
      { conversationId: "c3", projectId: "p1", subject: { kind: "project", id: "p1" }, status: "resolved", pendingAskCount: 2 },
      { conversationId: "c4", projectId: "p1", subject: { kind: "project", id: "p1" }, status: "open", pendingAskCount: 1 }
    ]
  });
  it("lists only open threads with a question, linked to the Flow or run", () => {
    const items = needsYouItems(threads, [], new Map([["f1", "Cheapest listings"]]));
    expect(items.map((item) => [item.text, item.href])).toEqual([
      ['"Cheapest listings" is waiting for your answer', "/flows/f1"],
      ["A question is waiting for your answer", "/flows"]
    ]);
  });
  it("lists a Flow that failed its newest runs in a row, and not one that recovered", () => {
    const runs = [
      run({ runId: "a", flowId: "f1", status: "failed", startedAt: NOW - MIN }),
      run({ runId: "b", flowId: "f1", status: "failed", startedAt: NOW - 2 * MIN }),
      run({ runId: "c", flowId: "f1", status: "succeeded", startedAt: NOW - 3 * MIN }),
      run({ runId: "d", flowId: "f2", flowName: "Post reply", status: "failed", startedAt: NOW - MIN }),
      run({ runId: "e", flowId: "f2", flowName: "Post reply", status: "succeeded", startedAt: NOW - 2 * MIN })
    ];
    expect(needsYouItems([], runs)).toEqual([
      { key: "fail:f1", text: '"Cheapest listings" failed its last 2 runs', href: "/runs/a", openLabel: "Open the latest failed run of Cheapest listings" }
    ]);
  });
  it("says nothing when nothing needs the person", () => {
    expect(needsYouItems([], [run({ runId: "a" })])).toEqual([]);
  });
});

describe("connectedGroups (Home's browsers and apps)", () => {
  const client = (clientId: string, label: string, status: string, over: Record<string, unknown> = {}) => ({ clientId, label, transport: "websocket", status, lastSeenAt: NOW - MIN, ...over });
  const all = [
    client("ext", "Chrome extension", "ready"),
    client("sdk-1", "Test SDK", "pairing_required", { lastSeenAt: NOW - 3 * MIN }),
    client("sdk-2", "Test SDK", "pairing_required", { lastSeenAt: NOW - 2 * MIN }),
    client("sdk-3", "Test SDK", "pairing_required", { lastSeenAt: NOW - MIN }),
    client("gone", "Old laptop", "offline"),
    client("runtime", "Web Automation Gateway Runtime", "available", { transport: "direct", lastSeenAt: undefined })
  ];
  const revoked = readRevokedAccess([{ trustedClientId: "t1", clientId: "gone", name: "Old laptop", status: "revoked" }, { trustedClientId: "t2", clientId: "ext", name: "Chrome extension", status: "active" }]);
  const groups = connectedGroups(all, revoked, NOW);
  it("lists only approved clients as connected", () => {
    expect(groups.connected.map((row) => row.name)).toEqual(["Chrome extension"]);
  });
  it("lists pending ones under waiting, repeat attempts folded into one row", () => {
    expect(groups.waiting).toHaveLength(1);
    expect(groups.waiting[0]).toMatchObject({ name: "Test SDK", state: "Waiting for approval", attempts: 3, lastSeen: "1 min ago" });
  });
  it("drops revoked clients and the built-in runtime row", () => {
    const names = [...groups.connected, ...groups.waiting].map((row) => row.name);
    expect(names).not.toContain("Old laptop");
    expect(names).not.toContain("Web Automation Gateway Runtime");
  });
  it("matches a removed browser by name when the gateway gives no client id", () => {
    const byName = readRevokedAccess([{ trustedClientId: "t1", name: "Old laptop", status: "revoked" }]);
    expect(connectedGroups(all, byName, NOW).connected.map((row) => row.name)).toEqual(["Chrome extension"]);
  });
  it("keeps a name that was removed and approved again", () => {
    const again = readRevokedAccess([{ trustedClientId: "t1", name: "Old laptop", status: "revoked" }, { trustedClientId: "t9", name: "Old laptop", status: "active" }]);
    expect(connectedGroups([client("gone", "Old laptop", "offline")], again, NOW).connected).toHaveLength(1);
  });
});
