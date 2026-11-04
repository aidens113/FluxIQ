// The recording's states: position comes from recorded answers, a move or act settles at
// the next look, relative moves are nodes of one position, and only success changes state.

import { describe, expect, it } from "vitest";
import { clientGatewayTraceStateRecording } from "../recording.ts";
import { calls, fakeDomain } from "./fake-domain.ts";

const ok = (at: string, rows?: readonly string[]) => ({ status: "ok", at, ...(rows ? { rows } : {}) });

describe("a recording's states", () => {
  it("reads position from a look, and settles an act at the next look, not at its own early answer", () => {
    const recording = clientGatewayTraceStateRecording({
      domain: fakeDomain,
      calls: calls(["scan", {}, ok("aisle-1")], ["pick", { part: "a" }, ok("aisle-1")], ["scan", {}, ok("aisle-2")])
    });
    expect(recording.startNode).toBe("aisle-1#0");
    expect(recording.entries[1]).toMatchObject({ node: "aisle-1#0", nodeAfter: "aisle-2#0" });
    expect(recording.entries[2]).toMatchObject({ node: "aisle-2#0" });
    expect([...recording.entries[2]!.actsBefore]).toEqual([1]);
    expect(recording.endNode).toBe("aisle-2#0");
  });

  it("counts relative moves as nodes of one position, and an absolute move returns the count to zero", () => {
    const recording = clientGatewayTraceStateRecording({
      domain: fakeDomain,
      calls: calls(["scan", {}, ok("a")], ["next_shelf", {}, ok("a")], ["scan", {}, ok("a")], ["next_shelf", {}, ok("a")], ["goto", { to: "a" }, ok("a")], ["scan", {}, ok("a")])
    });
    expect(recording.entries.map((entry) => entry.node)).toEqual(["a#0", "a#0", "a#1", "a#1", "a#2", "a#0"]);
  });

  it("starts no new state on a failed or no-effect call", () => {
    const recording = clientGatewayTraceStateRecording({
      domain: fakeDomain,
      calls: calls(["scan", {}, ok("a")], ["pick", { part: "x" }, { status: "failed" }], ["press", { part: "y" }, { status: "unchanged", at: "a" }], ["next_shelf", {}, { status: "failed" }], ["scan", {}, ok("a")])
    });
    expect(recording.entries[4]).toMatchObject({ node: "a#0" });
    expect(recording.entries[4]!.actsBefore.size).toBe(0);
  });

  it("follows a page that moved by itself between two looks", () => {
    const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: calls(["scan", {}, ok("a")], ["scan", {}, ok("b")]) });
    expect(recording.entries.map((entry) => entry.node)).toEqual(["a#0", "b#0"]);
  });

  it("keeps a receipted act out of what later calls had done", () => {
    const recording = clientGatewayTraceStateRecording({
      domain: fakeDomain,
      calls: calls(["pick", { part: "x" }, ok("a")], ["scan", {}, ok("a")]),
      receipts: new Map([[0, "changed_nothing" as const]])
    });
    expect(recording.entries[1]!.actsBefore.size).toBe(0);
    expect(recording.receipts.get(0)).toBe("changed_nothing");
  });

  it("takes the last rows as the result, across every page of that read, and its node as where the result was read", () => {
    const recording = clientGatewayTraceStateRecording({
      domain: fakeDomain,
      calls: calls(["scan", { list: true }, ok("a", ["r1"])], ["next_shelf", {}, ok("a")], ["scan", { list: true }, ok("a", ["r2"])], ["goto", { to: "b" }, ok("b")], ["scan", {}, ok("b")])
    });
    expect(recording.resultEntry).toBe(2);
    expect(recording.resultRows).toEqual(["r1", "r2"]);
    expect(recording.resultNode).toBe("a#1");
  });

  it("ends a task that acts after its last read at the state after that act", () => {
    const recording = clientGatewayTraceStateRecording({
      domain: fakeDomain,
      calls: calls(["scan", { list: true }, ok("a", ["r1"])], ["pick", { part: "x" }, ok("a")], ["scan", {}, ok("done")])
    });
    expect(recording.resultNode).toBe("done#0");
  });

  it("marks a recorded act in a layer from the look before it", () => {
    const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: calls(["pick", { part: "cover" }, ok("a")], ["scan", {}, ok("a")], ["pick", { part: "cover" }, ok("a")]) });
    expect(recording.entries.map((entry) => entry.oneTimeLayer)).toEqual([false, false, true]);
  });
});
