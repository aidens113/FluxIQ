// The state rule, rule by rule (the simulation study's section 4), over a fake domain.

import { describe, expect, it } from "vitest";
import { clientGatewayTraceStateRecording } from "../recording.ts";
import type { ClientGatewayTraceStateReceipt, ClientGatewayTraceStateRecordedCall } from "../types.ts";
import { ClientGatewayTraceStateWalker } from "../walker.ts";
import { calls, fakeDomain, operation, recorded } from "./fake-domain.ts";

const ok = (at: string, rows?: readonly string[]) => ({ status: "ok", at, ...(rows ? { rows } : {}) });

function walker(items: readonly ClientGatewayTraceStateRecordedCall[], options: { skippedActs: "gap" | "tolerate" } = { skippedActs: "gap" }, receipts?: ReadonlyMap<number, ClientGatewayTraceStateReceipt>) {
  const recording = clientGatewayTraceStateRecording({ domain: fakeDomain, calls: items, ...(receipts ? { receipts } : {}) });
  return new ClientGatewayTraceStateWalker(recording, fakeDomain, options);
}

const EXPLORED = calls(
  ["scan", {}, ok("a")],
  ["pick", { part: "x", bin: 1 }, ok("a")],
  ["scan", {}, ok("a")],
  ["pick", { part: "x", bin: 2 }, ok("a")],
  ["goto", { to: "b" }, ok("b")],
  ["scan", {}, ok("b")]
);

describe("the row computer, for a read the state holds no answer for", () => {
  const shelf = (rows: readonly string[]) => ({ status: "ok", at: "a", rows });

  it("computes it from a read of this state, and the rows are this run's result", () => {
    const walk = walker(calls(["scan", {}, shelf(["bolt", "nut"])], ["pick", { part: "x" }, ok("a")]));
    const answer = walk.answer(operation("scan", { keep: "bolt" }));
    expect(answer).toMatchObject({ status: "answered", rule: "read_computed", entry: 0, computed: { from: 0, rows: ["bolt"] } });
    expect(walk.rows).toEqual(["bolt"]);
  });

  it("never computes from a read of another state: that would show what this run did not cause", () => {
    const walk = walker(calls(["pick", { part: "x" }, ok("a")], ["scan", {}, shelf(["bolt"])]));
    expect(walk.answer(operation("scan", { keep: "bolt" }))).toMatchObject({ status: "gap", code: "argument_mismatch" });
  });

  it("stays a gap when the domain cannot compute it, and never reads what was withheld", () => {
    const walk = walker(calls(["scan", { other: true }, shelf(["bolt"])]));
    expect(walk.answer(operation("scan", { keep: "bolt" }))).toMatchObject({ status: "gap", code: "argument_mismatch" });
    const withheld = walker([recorded(0, "scan", {}, shelf(["bolt"]), { redacted: true })]);
    expect(withheld.answer(operation("scan", { keep: "bolt" }))).toMatchObject({ status: "gap" });
  });

  it("recomputes a same-input read whose recorded answer does not stand for it, and gaps when it cannot", () => {
    const refusing = { ...fakeDomain, recordedAnswerFits: () => false };
    const answer = new ClientGatewayTraceStateWalker(clientGatewayTraceStateRecording({ calls: calls(["scan", {}, shelf(["bolt"])]), domain: refusing }), refusing).answer(operation("scan"));
    expect(answer).toMatchObject({ status: "gap", code: "argument_mismatch", refusedEntry: 0 });
    const asked = { ...fakeDomain, recordedAnswerFits: () => false, computeRead: () => ({ from: 0, answer: {}, rows: [] }) };
    const computed = new ClientGatewayTraceStateWalker(clientGatewayTraceStateRecording({ calls: calls(["scan", {}, shelf(["bolt"])]), domain: asked }), asked).answer(operation("scan"));
    expect(computed).toMatchObject({ status: "answered", rule: "read_computed", computed: { rows: [] } });
  });
});

describe("a run's own handles", () => {
  it("are read through the domain's scope on both sides, so two runs' calls compare", () => {
    const scoped = { ...fakeDomain, handleScope: () => {
      const seen: unknown[] = [];
      return (read: ReturnType<typeof operation>) => {
        const { tab, ...rest } = (read.compared.parameters ?? {}) as { tab?: unknown };
        if (tab === undefined) return read;
        if (!seen.includes(tab)) seen.push(tab);
        return operation(read.actionType, { ...rest, tab: seen.indexOf(tab) });
      };
    } };
    const walk = new ClientGatewayTraceStateWalker(clientGatewayTraceStateRecording({ calls: calls(["pick", { part: "x", tab: 41 }, ok("a")], ["pick", { part: "y", tab: 42 }, ok("a")]), domain: scoped }), scoped);
    expect(walk.answer(operation("pick", { part: "x", tab: 900 }))).toMatchObject({ status: "answered", entry: 0 });
    expect(walk.answer(operation("pick", { part: "y", tab: 900 }))).toMatchObject({ status: "gap", code: "missing_transition" });
  });
});

describe("rule 1: a read", () => {
  it("is answered from the current state, and the nth repeat gets the nth answer, then the last", () => {
    const walk = walker(calls(["scan", {}, ok("a", ["one"])], ["scan", {}, ok("a", ["two"])]));
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "answered", rule: "read_same_state", entry: 0 });
    expect(walk.answer(operation("scan"))).toMatchObject({ entry: 1 });
    expect(walk.answer(operation("scan"))).toMatchObject({ entry: 1 });
  });

  it("never answers the same input from after an act this run did not do: empty input says nothing about where it was read", () => {
    const walk = walker(calls(["scan", { other: true }, ok("a")], ["pick", { part: "x" }, ok("a")], ["scan", {}, ok("a")]));
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "gap", code: "state_changed_by_act", refusedEntry: 2 });
  });

  it("never answers the same input from another position", () => {
    const walk = walker(calls(["scan", { q: 1 }, ok("a")], ["goto", { to: "b" }, ok("b")], ["scan", { q: 2 }, ok("b")]));
    expect(walk.answer(operation("scan", { q: 2 }))).toMatchObject({ status: "gap", code: "other_position", refusedEntry: 2 });
  });

  it("gaps a read of changed input by naming where it differs, and goes on: a read gap does not end the run", () => {
    const walk = walker(calls(["scan", { filter: "red" }, ok("a")], ["goto", { to: "b" }, ok("b")]));
    expect(walk.answer(operation("scan", { filter: "blue" }))).toMatchObject({ status: "gap", code: "argument_mismatch", nearest: { entry: 0, fields: ["p.filter"] } });
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "answered", rule: "page_move" });
  });

  it("does not treat a changed row or wait as the same read, but does a declared wait", () => {
    const walk = walker(calls(["scan", { list: true }, ok("a")]));
    expect(walk.answer(operation("scan", { list: true, waitMs: 50 }))).toMatchObject({ status: "answered" });
    expect(walk.answer(operation("scan", { list: false }))).toMatchObject({ status: "gap" });
  });

  it("follows the page where the recording saw it move by itself, in order, and an act there may be answered at once", () => {
    const items = calls(["scan", {}, ok("a")], ["scan", {}, ok("b")], ["pick", { part: "x" }, ok("b")], ["scan", {}, ok("b")]);
    const inOrder = walker(items);
    expect(inOrder.answer(operation("scan"))).toMatchObject({ status: "answered", entry: 0 });
    expect(inOrder.currentNode).toBe("a#0");
    expect(inOrder.answer(operation("scan"))).toMatchObject({ status: "answered", entry: 1 });
    expect(inOrder.currentNode).toBe("b#0");
    const atOnce = walker(items);
    expect(atOnce.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "answered", entry: 2 });
    expect(atOnce.answer(operation("scan"))).toMatchObject({ status: "answered", entry: 3 });
  });

  it("follows a page that moved there and back in the order it went, and a second visit reads its own reads", () => {
    const items = calls(["goto", { to: "a" }, ok("a")], ["scan", {}, ok("a")], ["scan", {}, ok("b")], ["scan", {}, ok("a")], ["pick", { part: "x" }, ok("a")]);
    const walk = walker(items);
    expect(walk.answer(operation("goto", { to: "a" }))).toMatchObject({ entry: 0 });
    expect([walk.answer(operation("scan")), walk.answer(operation("scan")), walk.answer(operation("scan"))]).toMatchObject([{ entry: 1 }, { entry: 2 }, { entry: 3 }]);
    expect(walk.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "answered", entry: 4 });
  });

  it("does not follow a page that moved by itself after acts this run did not do", () => {
    const walk = walker(calls(["scan", { first: true }, ok("a")], ["pick", { part: "x" }, ok("a")], ["scan", {}, ok("b")]));
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "gap", code: "other_position" });
  });

  it("does not let a page's move by itself, seen earlier, stand in for a move this run did not make", () => {
    const items = calls(["scan", {}, ok("a")], ["scan", {}, ok("b")], ["goto", { to: "a" }, ok("a")], ["goto", { to: "b" }, ok("b")], ["scan", { list: true }, ok("b", ["r1"])]);
    const walk = walker(items);
    expect(walk.answer(operation("goto", { to: "a" }))).toMatchObject({ status: "answered", entry: 2 });
    expect(walk.answer(operation("scan", { list: true }))).toMatchObject({ status: "gap", code: "other_position" });
  });

  it("gaps a read recorded with a withheld field, and one the trace holds no answer for", () => {
    expect(walker([recorded(0, "scan", {}, ok("a"), { redacted: true })]).answer(operation("scan"))).toMatchObject({ code: "redacted_input" });
    expect(walker([recorded(0, "scan", {}, null)]).answer(operation("scan"))).toMatchObject({ code: "incomplete_capture" });
  });
});

describe("rule 2: a page move", () => {
  it("goes to the recorded state by the same input, from the same acts done, whichever node it stands on", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["goto", { to: "b" }, ok("b")], ["scan", {}, ok("b")], ["goto", { to: "a" }, ok("a")], ["goto", { to: "b" }, ok("b")]));
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "answered", entry: 1 });
    expect(walk.currentNode).toBe("b#0");
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "answered", entry: 4 });
    expect(walk.answer(operation("goto", { to: "a" }))).toMatchObject({ status: "answered", entry: 3 });
    expect(walk.currentNode).toBe("a#0");
  });

  it("refuses a move recorded only after acts this run did not do, and its next read does not guess", () => {
    const walk = walker(calls(["pick", { part: "x" }, ok("a")], ["goto", { to: "b" }, ok("b")], ["scan", {}, ok("b")]));
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "gap", code: "state_changed_by_act" });
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "gap", code: "after_unrecorded_move" });
  });

  it("loses the page on a move never recorded, and a recorded absolute move restores it", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["goto", { to: "b" }, ok("b")], ["scan", {}, ok("b")]));
    expect(walk.answer(operation("goto", { to: "elsewhere" }))).toMatchObject({ status: "gap", code: "missing_transition" });
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "gap", code: "after_unrecorded_move" });
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "answered" });
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "answered", entry: 2 });
  });

  it("moves relatively only from the node it was recorded at, and refuses one past the recorded end", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["next_shelf", {}, ok("a")], ["scan", {}, ok("a")]));
    expect(walk.answer(operation("next_shelf"))).toMatchObject({ status: "answered", entry: 1 });
    expect(walk.currentNode).toBe("a#1");
    expect(walk.answer(operation("next_shelf"))).toMatchObject({ status: "gap", code: "other_position" });
  });

  it("answers a recorded failed move the same, and stays where it was", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["goto", { to: "b" }, { status: "failed" }]));
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "answered", rule: "page_move_recorded_failure" });
    expect(walk.currentNode).toBe("a#0");
  });
});

describe("rule 3: an act", () => {
  it("is used once; again is gap would_repeat_act, and the run stays on the recording", () => {
    const walk = walker(calls(["pick", { part: "x" }, ok("a")], ["scan", {}, ok("a")]));
    expect(walk.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "answered", rule: "act", entry: 0 });
    expect(walk.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "gap", code: "would_repeat_act" });
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "answered", entry: 1 });
    expect(walk.used).toEqual([0]);
  });

  it("is matched with its row: another row is gap other_row, never the recorded row's answer", () => {
    const walk = walker(calls(["pick", { part: "x", bin: 1 }, ok("a")]));
    expect(walk.answer(operation("pick", { part: "x", bin: 9 }))).toMatchObject({ status: "gap", code: "other_row" });
  });

  it("may take siblings in any order, and the state still needs both to read what followed them", () => {
    const walk = walker(EXPLORED, { skippedActs: "tolerate" });
    expect(walk.answer(operation("pick", { part: "x", bin: 2 }))).toMatchObject({ status: "answered", entry: 3 });
    expect(walk.answer(operation("pick", { part: "x", bin: 1 }))).toMatchObject({ status: "answered", entry: 1 });
  });

  it("refuses a recorded act before one already used unless it is a sibling", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["pick", { part: "x" }, ok("a")], ["press", { part: "y" }, ok("a")]), { skippedActs: "tolerate" });
    expect(walk.answer(operation("press", { part: "y" }))).toMatchObject({ status: "answered", entry: 2 });
    expect(walk.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "gap", code: "act_out_of_order" });
  });

  it("answers a recorded failure the same, but a later recorded success of that call wins", () => {
    const failed = walker(calls(["pick", { part: "x" }, { status: "failed" }]));
    expect(failed.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "answered", rule: "act_recorded_failure" });
    expect(failed.used).toEqual([]);
    const retried = walker(calls(["pick", { part: "x" }, { status: "failed" }], ["pick", { part: "x" }, ok("a")]));
    expect(retried.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "answered", rule: "act", entry: 1 });
  });

  it("marks a dismissal as maybe gone next time, and still answers it", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["pick", { part: "cover" }, ok("a")]));
    expect(walk.answer(operation("pick", { part: "cover" }))).toMatchObject({ status: "answered", mayBeGoneNextTime: true });
  });

  it("refuses an act recorded on another position", () => {
    const walk = walker(calls(["goto", { to: "b" }, ok("b")], ["scan", {}, ok("b")], ["pick", { part: "x" }, ok("b")]), { skippedActs: "tolerate" });
    expect(walk.answer(operation("pick", { part: "x" }))).toMatchObject({ status: "gap", code: "other_position" });
  });
});

describe("rule 4: an act not recorded", () => {
  it("puts the run off the recording: every later command is a gap", () => {
    const walk = walker(calls(["scan", {}, ok("a")], ["goto", { to: "b" }, ok("b")]));
    expect(walk.answer(operation("press", { part: "new" }))).toMatchObject({ status: "gap", code: "missing_transition" });
    expect(walk.hasLeftRecording).toBe(true);
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "gap", code: "after_unrecorded_act" });
    expect(walk.answer(operation("goto", { to: "b" }))).toMatchObject({ status: "gap", code: "after_unrecorded_act" });
  });
});

describe("skipped acts", () => {
  it("under gap, refuses what followed an act this run skipped, unless the act holds a receipt", () => {
    const items = calls(["scan", { first: true }, ok("a")], ["pick", { part: "x" }, ok("a")], ["press", { part: "y" }, ok("a")], ["scan", {}, ok("a")]);
    expect(walker(items).answer(operation("press", { part: "y" }))).toMatchObject({ status: "gap", code: "state_changed_by_act" });
    const receipted = walker(items, { skippedActs: "gap" }, new Map([[1, "changed_nothing" as const]]));
    expect(receipted.answer(operation("press", { part: "y" }))).toMatchObject({ status: "answered", entry: 2 });
    expect(receipted.answer(operation("scan"))).toMatchObject({ status: "answered", entry: 3 });
  });

  it("under tolerate, answers with the count of acts it skipped", () => {
    const walk = walker(calls(["scan", { first: true }, ok("a")], ["pick", { part: "x" }, ok("a")], ["press", { part: "y" }, ok("a")], ["scan", {}, ok("a")]), { skippedActs: "tolerate" });
    expect(walk.answer(operation("press", { part: "y" }))).toMatchObject({ status: "answered", skippedActs: 1 });
    expect(walk.answer(operation("scan"))).toMatchObject({ status: "answered", skippedActs: 1 });
  });
});

describe("rule 7: a different wait", () => {
  const timedOut = [recorded(0, "scan", {}, { status: "failed", at: "a", timedOut: true }, { latencyMs: 100 })];
  const slow = [recorded(0, "scan", {}, ok("a"), { latencyMs: 500 })];

  it("is accepted when the recorded answer came inside it", () => {
    expect(walker(slow).answer(operation("scan", { waitMs: 1000 }))).toMatchObject({ status: "answered" });
    expect(walker(timedOut).answer(operation("scan", { waitMs: 100 }))).toMatchObject({ status: "answered" });
  });

  it("is a gap when the recording gave up sooner, or answered after this command would have stopped", () => {
    expect(walker(timedOut).answer(operation("scan", { waitMs: 5000 }))).toMatchObject({ status: "gap", code: "wait_longer_than_recorded" });
    expect(walker(slow).answer(operation("scan", { waitMs: 100 }))).toMatchObject({ status: "gap", code: "wait_shorter_than_recorded" });
  });

  it("takes a call with the recorded call's own wait as the same call, whatever its clock said", () => {
    const own = [recorded(0, "scan", { waitMs: 100 }, ok("a"), { latencyMs: 500 })];
    expect(walker(own).answer(operation("scan", { waitMs: 100 }))).toMatchObject({ status: "answered" });
    expect(walker(own).answer(operation("scan", { waitMs: 50 }))).toMatchObject({ status: "gap", code: "wait_shorter_than_recorded" });
  });
});
