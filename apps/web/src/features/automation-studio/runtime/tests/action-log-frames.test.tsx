import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeAttemptRow } from "../RunDetailPanels";
import { runtimeRunLogFrames } from "../action-log-frames";

// The run detail's rows for a run whose step "search" called the part
// "part.search", which itself called "part.filter" (Core `frame-attempts.ts`).
const rows = [
  { attemptId: "open.1", nodeId: "open" },
  { attemptId: "call.1", nodeId: "search", subflowTarget: { subflowId: "part.search", graphFlowId: "flow.sub.search", graphRevision: 2 } },
  { attemptId: "call.1:type.1", nodeId: "type", parentAttemptId: "call.1", framePath: ["i1", "i2"] },
  { attemptId: "call.1:inner.1", nodeId: "inner", parentAttemptId: "call.1", framePath: ["i1", "i2"], subflowTarget: { subflowId: "part.filter", graphFlowId: "flow.sub.filter", graphRevision: 1 } },
  { attemptId: "call.1:inner.1:pick.1", nodeId: "pick", parentAttemptId: "call.1:inner.1", framePath: ["i1", "i2", "i3"] },
  { attemptId: "call.1:submit.1", nodeId: "submit", parentAttemptId: "call.1", framePath: ["i1", "i2"] },
  { attemptId: "done.1", nodeId: "done" }
];

describe("run log frames", () => {
  it("places a part's steps under their call, a level per part, and heads each group once with the part", () => {
    expect(runtimeRunLogFrames(rows)).toEqual([
      { depth: 0 },
      { depth: 0, calls: "part.search" },
      { depth: 1, part: "part.search" },
      { depth: 1, calls: "part.filter" },
      { depth: 2, part: "part.filter" },
      { depth: 1 },
      { depth: 0 }
    ]);
  });

  it("reads a page that opens inside a part from the frame path, and says the part continues", () => {
    expect(runtimeRunLogFrames(rows.slice(4))).toEqual([{ depth: 2, continued: true }, { depth: 1, continued: true }, { depth: 0 }]);
  });

  it("reads a run with no parts as flat, and survives rows that are not records", () => {
    expect(runtimeRunLogFrames([{ attemptId: "a" }, null, "x", { attemptId: "b", parentAttemptId: "" }])).toEqual([{ depth: 0 }, { depth: 0 }, { depth: 0 }, { depth: 0 }]);
  });

  it("indents a part's row and heads its group with the part's name", () => {
    const frames = runtimeRunLogFrames(rows);
    const call = renderToStaticMarkup(createElement(RuntimeAttemptRow, { attempt: rows[1], frame: frames[1], index: 1 }));
    expect(call).toContain("calls-part");
    expect(call).toContain("Ran the part “part.search”; its steps are listed under this one.");
    const first = renderToStaticMarkup(createElement(RuntimeAttemptRow, { attempt: rows[2], frame: frames[2], index: 2 }));
    expect(first).toContain("in-part");
    expect(first).toContain("--automation-runtime-part-depth:1");
    expect(first).toContain("Part “part.search”");
    const later = renderToStaticMarkup(createElement(RuntimeAttemptRow, { attempt: rows[5], frame: frames[5], index: 5 }));
    expect(later).not.toContain("automation-runtime-attempt-part");
    const root = renderToStaticMarkup(createElement(RuntimeAttemptRow, { attempt: rows[0], frame: frames[0], index: 0 }));
    expect(root).not.toContain("in-part");
    expect(root).not.toContain("part-depth");
  });
});
