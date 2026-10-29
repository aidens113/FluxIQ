// A graph run finds a stale target again from the step that found it (t786,
// design D2-D6, D8): a row-bound press whose row's values changed in a redraw
// fails three times, the list read is re-run internally, the host finds the same
// row by its identity, and the fourth attempt -- the retry the policy already
// had -- runs on the fresh row. An item found gone ends the step without a
// further dispatch; a host that cannot tell leaves the retries as they were.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_TARGET_GONE_CODE, type AutomationStudioTargetReacquireAnswer } from "../index.ts";
import { repairer } from "../../lifecycle-run/tests/in-run-repair-fixtures.ts";
import { attemptsOf, cardsFlow, cardsOptions, edge, graph, matchingHost, press, readCards, reacquireRows, redrawnPage, runCards, saveCard, type Card, type Host } from "./reacquire-fixtures.ts";

const statuses = (attempts: readonly { status: string }[]) => attempts.map((attempt) => attempt.status);

describe("a stale target found again in a graph run", () => {
  it("spends the fourth attempt on the fresh row: four attempts in all, the re-run unseen, the pass's row replaced, one recovery that succeeded", async () => {
    // Two cards, the loop taking only the first: the host is offered the whole fresh list all the same.
    const page = redrawnPage([{ id: "r1", title: "Lentil soup", saves: 3 }, { id: "r2", title: "Plum cake", saves: 9 }]);
    const requests: unknown[] = [];
    const { trace, executed, rows } = await runCards(cardsFlow({ each: { stopAfter: 1 } }), cardsOptions(page, matchingHost(requests)));

    expect(trace.status).toBe("succeeded");
    const saves = attemptsOf(trace, "save");
    expect(statuses(saves)).toEqual(["failed", "failed", "failed", "succeeded"]);
    expect(saves.map((attempt) => attempt.reacquire?.outcome)).toEqual([undefined, undefined, undefined, "found"]);
    expect(saves[3]!.reacquire).toEqual({ sourceNodeId: "read", kind: "row", outcome: "found", at: expect.any(Number) });
    expect(saves[3]!.retry).toMatchObject({ attemptNumber: 4, maxAttempts: 4, previousAttemptId: saves[2]!.attemptId });
    // The re-run of the read is internal: dispatched, but never an attempt of the run.
    expect(page.reads).toBe(2);
    expect(attemptsOf(trace, "read")).toHaveLength(1);
    expect(page.calls).toEqual(["read", "save", "save", "save", "read", "save"]);
    expect(page.saved).toEqual(["r1"]);
    // Attempt ids stay unique and in order: the re-run took none.
    expect(new Set(trace.attempts.map((attempt) => attempt.attemptId)).size).toBe(trace.attempts.length);
    // The pass's row is the fresh one, under both keys, and the fourth attempt was handed it.
    const fresh = { id: "r1", title: "Lentil soup", saves: 4 };
    expect(executed.values.item).toEqual(fresh);
    expect(executed.values["each.item"]).toEqual(fresh);
    expect(attemptsOf(executed, "save")[3]!.inputs.item).toEqual(fresh);
    // The loop's own list is not replaced, and the saved trace withholds the row as it withholds every value the run resolved.
    expect(JSON.stringify(trace.values)).not.toContain("Lentil soup");
    expect(executed.values["read.rows"]).toEqual([{ id: "r1", title: "Lentil soup", saves: 3 }, { id: "r2", title: "Plum cake", saves: 9 }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      node: { id: "save" },
      source: { id: "read" },
      lineage: { kind: "row", sourceNodeId: "read", outputKey: "rows", loopNodeId: "each" },
      stale: { id: "r1", title: "Lentil soup", saves: 3 },
      candidates: [fresh, { id: "r2", title: "Plum cake", saves: 9 }],
      failure: { code: "web.target.not_found" }
    });
    const said = reacquireRows(rows);
    expect(said).toHaveLength(1);
    expect(said[0]!.detail).toMatchObject({ kind: "step", ref: "save", status: "succeeded", recovery: { kind: "reacquire", outcome: "succeeded", subject: "Found the item from “Read the recipes” again" } });
  });

  it("lays a found value over a `$node` binding for the step's remaining attempts only", async () => {
    // The look-up answers the control with a handle the page renumbers once, after the first look-up.
    const page = { handle: "h1", finds: 0, calls: [] as string[] };
    const find = { ...press("find", "find", {}, { effect: "observe", bootstrapSymbolicKey: "s1" }), label: "Find the control" };
    const act = press("act", "act", { element: { $state: { path: "$node.s1.element" } } as unknown as JsonObject });
    const flow = graph([{ id: "start", definitionId: "builtin.control.start" }, find, act, { id: "end", definitionId: "builtin.control.end" }], [edge("start", "find"), edge("find", "act"), edge("act", "end")]);
    const requests: unknown[] = [];
    const host = matchingHost(requests, (request) => ({ outcome: "found", value: request.candidates.find((candidate) => (candidate as { name?: string }).name === (request.stale as { name?: string }).name)! }));
    const { trace, executed, rows } = await runCards(flow, {
      hostRuntime: host,
      delay: async () => undefined,
      effectDispatcher: (effect) => {
        const parameters = ((effect.payload ?? {}) as { parameters?: { elementId?: string; element?: { handle?: string } } }).parameters ?? {};
        page.calls.push(parameters.elementId ?? "?");
        if (parameters.elementId === "find") {
          page.finds += 1;
          const element = { name: "Save", handle: page.handle };
          if (page.finds === 1) page.handle = "h2";
          return { status: "success", route: "success", outputs: { element } };
        }
        return parameters.element?.handle === page.handle ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "action_failed", code: "web.handle.renumbered_by_reload", retryable: true, stage: "dispatch", effect: "unacted" } };
      }
    });

    expect(trace.status).toBe("succeeded");
    const acts = attemptsOf(trace, "act");
    expect(statuses(acts)).toEqual(["failed", "failed", "failed", "succeeded"]);
    expect(acts[3]!.reacquire).toEqual({ sourceNodeId: "find", kind: "output", outcome: "found", at: expect.any(Number) });
    expect(page.calls).toEqual(["find", "act", "act", "act", "find", "act"]);
    expect(attemptsOf(trace, "find")).toHaveLength(1);
    expect(requests[0]).toMatchObject({ lineage: { kind: "output", outputKey: "element", parameterPath: "parameters.element" }, stale: { handle: "h1" }, candidates: [{ name: "Save", handle: "h2" }] });
    // The run's own value is not replaced: the overlay was the node's alone.
    expect(executed.values["find.element"]).toEqual({ name: "Save", handle: "h1" });
    expect(attemptsOf(executed, "act")[3]!.inputs["find.element"]).toEqual({ name: "Save", handle: "h2" });
    expect(reacquireRows(rows).map((row) => row.detail?.recovery?.subject)).toEqual(["Found the item from “Find the control” again"]);
  });

  it("ends a gone item without a fourth dispatch, takes the failed route, and says it is gone", async () => {
    const page = redrawnPage();
    const requests: unknown[] = [];
    const host = matchingHost(requests, () => ({ outcome: "gone" }));
    const { trace, rows } = await runCards(cardsFlow({ failedTo: press("note", "note") }), cardsOptions(page, host));

    expect(trace.status).toBe("succeeded");
    const saves = attemptsOf(trace, "save");
    expect(statuses(saves)).toEqual(["failed", "failed", "failed", "failed"]);
    expect(page.calls.filter((call) => call === "save")).toHaveLength(3);
    expect(saves[3]).toMatchObject({
      message: "The item it was for is no longer on the page.",
      failure: { category: "target_not_found", code: AUTOMATION_STUDIO_TARGET_GONE_CODE, retryable: false, stage: "target_resolution", effect: "unacted" },
      reacquire: { sourceNodeId: "read", kind: "row", outcome: "gone" },
      inputs: {},
      outputs: {}
    });
    // The failed route was taken, and no retry was spent on the gone item.
    expect(page.calls).toEqual(["read", "save", "save", "save", "read", "note"]);
    const said = reacquireRows(rows);
    expect(said).toHaveLength(1);
    expect(said[0]!.detail).toMatchObject({ ref: "save", status: "failed", recovery: { kind: "reacquire", outcome: "failed", subject: "The item from “Read the recipes” is gone" } });
  });

  it("asks no in-run repair for a gone item: the run ends failed on it", async () => {
    const page = redrawnPage();
    const repair = repairer(() => ({ kind: "none", reason: "no fix" }));
    const flow = cardsFlow({ save: saveCard({ parameterValues: { onFailure: "stop" } }) });
    const { trace } = await runCards(flow, cardsOptions(page, matchingHost([], () => ({ outcome: "gone" })), { repairIncident: repair.callback }));

    expect(trace.status).toBe("failed");
    expect(attemptsOf(trace, "save").at(-1)?.failure?.code).toBe(AUTOMATION_STUDIO_TARGET_GONE_CODE);
    expect(repair.requests).toHaveLength(0);
    // The same flow with a target the page refuses for another reason does ask: the guard is the gone code alone.
    const refused = redrawnPage();
    const asked = repairer(() => ({ kind: "none", reason: "no fix" }));
    await runCards(flow, cardsOptions(refused, matchingHost([], () => ({ outcome: "unmatched", reason: "ambiguous" })), { repairIncident: asked.callback }));
    expect(asked.requests).toHaveLength(1);
  });

  it.each<[string, Host | ((requests: unknown[]) => Host), { outcome: string; reason?: string }, number]>([
    ["the host cannot tell which candidate it is", (requests) => matchingHost(requests, () => ({ outcome: "unmatched", reason: "ambiguous" })), { outcome: "unmatched", reason: "ambiguous" }, 2],
    ["the host throws", (requests) => matchingHost(requests, () => { throw new Error("the matcher broke on “Lentil soup”"); }), { outcome: "unmatched", reason: "host_failed" }, 2],
    ["the host answers outside the contract", (requests) => matchingHost(requests, () => ({ outcome: "found" }) as unknown as AutomationStudioTargetReacquireAnswer), { outcome: "unmatched", reason: "malformed_answer" }, 2],
    ["the host has no matcher", { capabilities: [] }, { outcome: "unavailable", reason: "no_matcher" }, 1]
  ])("runs attempt 4 on the old binding when %s", async (_case, hostOf, record, reads) => {
    const page = redrawnPage();
    const requests: unknown[] = [];
    const host = typeof hostOf === "function" ? hostOf(requests) : hostOf;
    const { trace, executed, rows } = await runCards(cardsFlow(), cardsOptions(page, host));

    const saves = attemptsOf(trace, "save");
    expect(statuses(saves)).toEqual(["failed", "failed", "failed", "failed"]);
    expect(page.calls.filter((call) => call === "save")).toHaveLength(4);
    expect(saves[3]!.reacquire).toEqual({ sourceNodeId: "read", kind: "row", at: expect.any(Number), ...record });
    expect(saves[3]!.failure?.code).toBe("web.target.not_found");
    expect(attemptsOf(executed, "save")[3]!.inputs.item).toEqual({ id: "r1", title: "Lentil soup", saves: 3 });
    expect(page.reads).toBe(reads);
    expect(reacquireRows(rows)).toEqual([]);
    // The host's failure text never reaches the trace.
    expect(JSON.stringify(trace)).not.toContain("matcher broke");
  });

  it("never re-runs a source that acts: the re-acquire records unavailable and the retries run as before", async () => {
    const page = redrawnPage();
    const requests: unknown[] = [];
    const { trace } = await runCards(cardsFlow({ read: readCards("mutate") }), cardsOptions(page, matchingHost(requests)));

    expect(attemptsOf(trace, "save")[3]!.reacquire).toMatchObject({ outcome: "unavailable", reason: "source_not_read_only" });
    expect(page.reads).toBe(1);
    expect(requests).toHaveLength(0);
  });

  it("re-acquires once per arrival, before attempt 4 only, however many attempts a node has", async () => {
    const page = redrawnPage();
    const requests: unknown[] = [];
    const host = matchingHost(requests, () => ({ outcome: "unmatched", reason: "unidentifiable" }));
    const { trace } = await runCards(cardsFlow({ save: saveCard({ parameterValues: { retry: { maxAttempts: 6, backoffMs: 0 } } }) }), cardsOptions(page, host));

    const saves = attemptsOf(trace, "save");
    expect(saves).toHaveLength(6);
    expect(requests).toHaveLength(1);
    expect(saves.map((attempt) => attempt.reacquire?.outcome)).toEqual([undefined, undefined, undefined, "unmatched", undefined, undefined]);
  });

  it("does nothing on a step whose target came from no other step, or that failed for another reason", async () => {
    const page = redrawnPage();
    const requests: unknown[] = [];
    // The press names a fixed control, with no row: lineage none.
    const fixed = press("save", "save", { row: { id: "r1", title: "Lentil soup", saves: 3 } as Card });
    const wired = cardsFlow({ save: fixed });
    const { trace } = await runCards({ ...wired, edges: wired.edges.filter((candidate) => candidate.sourcePortId !== "item") }, cardsOptions(page, matchingHost(requests)));
    expect(attemptsOf(trace, "save").every((attempt) => attempt.reacquire === undefined)).toBe(true);
    expect(requests).toHaveLength(0);

    // A failure that is not about the target (the page was busy) is retried as before, never re-acquired.
    const busy = redrawnPage();
    const options = cardsOptions(busy, matchingHost(requests));
    const dispatch = options.effectDispatcher!;
    options.effectDispatcher = async (effect, context) => {
      const answer = await dispatch(effect, context);
      return answer?.status === "failed" ? { ...answer, failure: { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" } } : answer;
    };
    const { trace: busyTrace } = await runCards(cardsFlow(), options);
    expect(attemptsOf(busyTrace, "save").every((attempt) => attempt.reacquire === undefined)).toBe(true);
    expect(requests).toHaveLength(0);
  });
});
