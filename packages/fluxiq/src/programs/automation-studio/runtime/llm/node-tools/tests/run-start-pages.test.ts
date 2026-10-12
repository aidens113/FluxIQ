// Where each node of a run started, read off the run's own attempt records
// (`../run-start-pages.ts`).
//
// Live run `run-muqk713g-d08ad3dc` (C6): the re-author seeded its draft from the
// Flow, and every rerun of the Flow's list read ran on results page 5, where the
// refuted run's own pagination had left the page. The run had captured the page
// before that read started; nothing carried it to the rerun.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioRunNodeStartPages } from "../run-start-pages.ts";

function attempt(order: number, nodeId: string, from?: unknown, extra: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord {
  return {
    attemptId: `attempt.${order}`,
    nodeId,
    definitionId: "web.output.dom-extract_list",
    order,
    status: "succeeded",
    startedAt: order,
    ...(from === undefined ? {} : { metadata: { stateRefs: { beforeAction: { stateSnapshotId: `s${order}`, stateRef: `s${order}@attempt.${order}:before_action`, capturedAt: order, from } } } as unknown as JsonObject }),
    ...extra
  };
}

describe("where each node of a run started", () => {
  it("reads the host's own token from the state captured before each node's first attempt", () => {
    const pages = automationStudioRunNodeStartPages({
      actionAttempts: [
        attempt(1, "main.s1", { location: "/" }),
        attempt(2, "main.s4", { location: "/s?k=earbuds" }),
        attempt(3, "main.s5", { location: "/s?k=earbuds&page=1" })
      ]
    });
    expect(pages).toEqual({ "main.s1": { location: "/" }, "main.s4": { location: "/s?k=earbuds" }, "main.s5": { location: "/s?k=earbuds&page=1" } });
  });

  it("keeps a node's first attempt: a retry starts where the failed attempt left the page", () => {
    const pages = automationStudioRunNodeStartPages({
      actionAttempts: [attempt(4, "main.s5", { location: "page=5" }), attempt(3, "main.s5", { location: "page=1" })]
    });
    expect(pages).toEqual({ "main.s5": { location: "page=1" } });
  });

  it("names no page for a node whose first attempt captured none, rather than borrowing a later one", () => {
    const pages = automationStudioRunNodeStartPages({
      actionAttempts: [attempt(1, "main.s5"), attempt(2, "main.s5", { location: "page=5" })]
    });
    expect(pages).toEqual({});
  });

  it("carries only an object token, unread", () => {
    const pages = automationStudioRunNodeStartPages({
      actionAttempts: [attempt(1, "a", "page=1"), attempt(2, "b", ["page=1"]), attempt(3, "c", null), attempt(4, "d", { anything: { the: "host says" } })]
    });
    expect(pages).toEqual({ d: { anything: { the: "host says" } } });
  });

  it("answers nothing for a run that recorded no attempts", () => {
    expect(automationStudioRunNodeStartPages({})).toEqual({});
    expect(automationStudioRunNodeStartPages({ actionAttempts: [] })).toEqual({});
  });

  it("hands back a copy, so a seed cannot write into the run record", () => {
    const run = { actionAttempts: [attempt(1, "a", { location: "/" })] };
    const pages = automationStudioRunNodeStartPages(run);
    (pages.a as { location: string }).location = "changed";
    expect(automationStudioRunNodeStartPages(run)).toEqual({ a: { location: "/" } });
  });

  // t406: a called part's node can share an id with the Flow's own.
  it("reads the root frame's nodes alone, never a called part's of the same id", () => {
    const pages = automationStudioRunNodeStartPages({
      actionAttempts: [
        attempt(1, "s1", { location: "/" }),
        attempt(2, "s2", { location: "/part" }, { attemptId: "attempt.1:s2", parentAttemptId: "attempt.1" }),
        attempt(3, "s2", { location: "/flow" })
      ]
    });
    expect(pages).toEqual({ s1: { location: "/" }, s2: { location: "/flow" } });
  });
});
