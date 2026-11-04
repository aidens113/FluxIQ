// The end check and the pure verdict: same rows, acts covered, reached the end, no gaps.

import { describe, expect, it } from "vitest";
import { clientGatewayTraceStateEndCheck } from "../end-check.ts";
import { clientGatewayTraceStateRecording } from "../recording.ts";
import type { ClientGatewayTraceStateGapCode, ClientGatewayTraceStateReceipt, ClientGatewayTraceStateRecordedCall } from "../types.ts";
import { clientGatewayTraceStateVerdict } from "../verdict.ts";
import { ClientGatewayTraceStateWalker } from "../walker.ts";
import { calls, fakeDomain, operation } from "./fake-domain.ts";

const ok = (at: string, rows?: readonly string[]) => ({ status: "ok", at, ...(rows ? { rows } : {}) });

const EXPLORED = calls(
  ["scan", {}, ok("a")],
  ["pick", { part: "x" }, ok("a")],
  ["goto", { to: "b" }, ok("b")],
  ["scan", { list: true }, ok("b", ["r1", "r2"])]
);
const WHOLE = [operation("scan"), operation("pick", { part: "x" }), operation("goto", { to: "b" }), operation("scan", { list: true })];

function judge(items: readonly ClientGatewayTraceStateRecordedCall[], flow: readonly ReturnType<typeof operation>[], receipts?: ReadonlyMap<number, ClientGatewayTraceStateReceipt>) {
  const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: items, ...(receipts ? { receipts } : {}) });
  const walker = new ClientGatewayTraceStateWalker(recording, fakeDomain);
  const gaps: ClientGatewayTraceStateGapCode[] = [];
  for (const command of flow) {
    const answer = walker.answer(command);
    if (answer.status === "gap") gaps.push(answer.code);
  }
  const end = clientGatewayTraceStateEndCheck(recording, walker);
  return { end, verdict: clientGatewayTraceStateVerdict({ recording, end, gaps }) };
}

describe("a recording that read rows and kept none", () => {
  it("is no reference: two empty lists are not the same result, whatever the Flow did", () => {
    const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: calls(["scan", {}, { status: "ok", at: "a", rows: [] }]) });
    const verdict = clientGatewayTraceStateVerdict({ recording, end: { used: [], receipted: [], skipped: [], reachedEnd: true, rows: [], afterChangedRows: false }, gaps: [] });
    expect(verdict.verdict).toBe("inconclusive");
    expect(verdict.reasons).toEqual(["recording.no_result_rows"]);
    expect(verdict.assertions.every((assertion) => assertion.outcome === "unverified")).toBe(true);
  });

  it("does not speak for what follows a computed read that changed the rows", () => {
    const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: calls(["scan", {}, { status: "ok", at: "a", rows: ["bolt", "nut"] }], ["pick", { part: "x" }, { status: "ok", at: "a" }], ["scan", { list: true }, { status: "ok", at: "a", rows: ["done"] }]) });
    const walker = new ClientGatewayTraceStateWalker(recording, fakeDomain);
    expect(walker.answer(operation("scan", { keep: "bolt" }))).toMatchObject({ rule: "read_computed" });
    expect(walker.afterChangedRows).toBe(false);
    expect(walker.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "answered" });
    expect(walker.afterChangedRows).toBe(true);
    expect(walker.answer(operation("scan", { list: true }))).toMatchObject({ status: "answered" });
    const end = clientGatewayTraceStateEndCheck(recording, walker);
    expect(clientGatewayTraceStateVerdict({ recording, end, gaps: [] })).toMatchObject({ verdict: "inconclusive", reasons: ["recording.after_changed_rows"] });
  });

  it("judges a computed read that is the last thing the run read: same rows or not is on recorded support", () => {
    const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: calls(["scan", {}, { status: "ok", at: "a", rows: ["bolt", "nut"] }]) });
    const walker = new ClientGatewayTraceStateWalker(recording, fakeDomain);
    walker.answer(operation("scan", { keep: "bolt" }));
    const end = clientGatewayTraceStateEndCheck(recording, walker);
    expect(clientGatewayTraceStateVerdict({ recording, end, gaps: [] })).toMatchObject({ verdict: "fail", reasons: ["recording.same_rows"] });
  });

  it("does not hold back a recording that read no rows at all: a task of acts has none", () => {
    const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: calls(["scan", {}, { status: "ok", at: "a" }]) });
    expect(clientGatewayTraceStateVerdict({ recording, end: { used: [], receipted: [], skipped: [], reachedEnd: true, rows: [], afterChangedRows: false }, gaps: [] }).verdict).toBe("pass");
  });
});

describe("the pure verdict", () => {
  it("passes a Flow that repeats the recording's path", () => {
    const { verdict, end } = judge(EXPLORED, WHOLE);
    expect(verdict.verdict).toBe("pass");
    expect(verdict.reasons).toEqual([]);
    expect(verdict.assertions.every((assertion) => assertion.outcome === "satisfied")).toBe(true);
    expect(end).toMatchObject({ used: [1], skipped: [], reachedEnd: true, rows: ["r1", "r2"] });
  });

  it("fails, on recorded support, a run that stops before the result was read", () => {
    const { verdict } = judge(EXPLORED, WHOLE.slice(0, 3));
    expect(verdict.verdict).toBe("fail");
    expect(verdict.reasons).toEqual(["recording.same_rows"]);
  });

  it("calls a recorded act never used a skipped act, unless it holds a receipt", () => {
    const items = calls(["scan", { first: true }, ok("a")], ["pick", { part: "x" }, ok("a")], ["scan", {}, ok("a")]);
    const flow = [operation("scan")];
    expect(judge(items, flow).verdict.verdict).toBe("inconclusive");
    const receipted = judge(items, flow, new Map([[1, "changed_nothing" as const]]));
    expect(receipted.verdict.verdict).toBe("pass");
    expect(receipted.end).toMatchObject({ receipted: [1], skipped: [] });
    const nothingAfter = calls(["scan", {}, ok("a")], ["pick", { part: "x" }, ok("a")]);
    expect(judge(nothingAfter, [operation("scan")]).verdict).toMatchObject({ verdict: "fail", reasons: ["recording.acts_covered"] });
  });

  it("makes any gap inconclusive, whatever else held, and leaves its assertions unverified", () => {
    const { verdict } = judge(EXPLORED, [...WHOLE, operation("pick", { part: "x" })]);
    expect(verdict.verdict).toBe("inconclusive");
    expect(verdict.reasons).toEqual(["would_repeat_act"]);
    expect(verdict.assertions.every((assertion) => assertion.outcome === "unverified")).toBe(true);
  });

  it("does not pass a Flow that ends somewhere the recording neither read its result nor ended", () => {
    const items = calls(["goto", { to: "a" }, ok("a")], ["scan", { list: true }, ok("a", ["r1"])], ["goto", { to: "b" }, ok("b")], ["goto", { to: "c" }, ok("c")]);
    const { verdict } = judge(items, [operation("goto", { to: "a" }), operation("scan", { list: true }), operation("goto", { to: "b" })]);
    expect(verdict).toMatchObject({ verdict: "fail", reasons: ["recording.reached_end"] });
    expect(judge(items, [operation("goto", { to: "a" }), operation("scan", { list: true })]).verdict.verdict).toBe("pass");
    expect(judge(items, [operation("goto", { to: "a" }), operation("scan", { list: true }), operation("goto", { to: "c" })]).verdict.verdict).toBe("pass");
  });

  it("does not pass a Flow whose rows are not the result's, and reads the rows of its last read across pages", () => {
    const items = calls(["scan", { list: "all" }, ok("a", ["r1", "r2"])], ["scan", { list: "best" }, ok("a", ["r1"])], ["next_shelf", {}, ok("a")], ["scan", { list: "best" }, ok("a", ["r3"])]);
    const pass = judge(items, [operation("scan", { list: "best" }), operation("next_shelf"), operation("scan", { list: "best" })]);
    expect(pass.end.rows).toEqual(["r1", "r3"]);
    expect(pass.verdict.verdict).toBe("pass");
    const wrong = judge(items, [operation("scan", { list: "all" }), operation("next_shelf")]);
    expect(wrong.verdict).toMatchObject({ verdict: "fail", reasons: ["recording.same_rows"] });
  });
});
