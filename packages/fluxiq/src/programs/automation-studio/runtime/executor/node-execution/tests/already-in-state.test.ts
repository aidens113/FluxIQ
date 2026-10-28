// t775: a step whose domain answers `skipped: "already_in_state"` pressed nothing
// because the page already showed the state its `ensureState` asks for. Its
// attempt reads succeeded and skipped as already in state, it is no completed
// act, and the chat says it was already so.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { answering, framedRun, withRows } from "../../lifecycle-run/tests/recovery-paths-fixtures.ts";
import { line, page, pageOptions, press } from "../../lifecycle-run/tests/wiring-fixtures.ts";
import { automationStudioAttemptAlreadyInState } from "../already-in-state.ts";

/** A press whose act lasts and changes something that exists, labelled as a person reads it. */
const flip = () => ({ ...press("flip", "flip", { declaredConsequences: ["modify_existing"] }), label: "Switch the setting" });

function alreadySaid(rows: readonly ClientGatewayActivity[]): Array<[string, unknown]> {
  return rows.filter((row) => row.label.startsWith("Not pressed")).map((row) => [row.label, row.detail?.skipped]);
}

describe("a step the domain found already in its asked state", () => {
  it("is recorded succeeded, skipped already_in_state by its success route, said already so, and kept out of the completed acts", async () => {
    const current = page();
    const options = pageOptions(current);
    answering(options, "flip", { skipped: "already_in_state" });
    const { result, rows } = await withRows(() => framedRun(line("graph.main", [flip(), press("after")]), options));
    const flipped = result.trace.attempts.filter((attempt) => attempt.nodeId === "flip");

    expect(result.trace.status).toBe("succeeded");
    expect(flipped).toHaveLength(1);
    expect(flipped[0]).toMatchObject({ status: "succeeded", route: "success", skipped: { reason: "already_in_state", code: "executor.act.already_in_state" }, outputs: { skipped: "already_in_state" } });
    expect(flipped[0]!.message).toContain("nothing was pressed");
    // The run went on past it, and the effect check did not hold it to an effect it never had.
    expect(result.trace.attempts.map((attempt) => attempt.nodeId)).toContain("after");
    expect(flipped[0]!.effectCheck).toBeUndefined();
    // Not a lasting act this run completed.
    expect([...result.invocation.run.lifecycle.completedActs.values()].map((done) => done.nodeId)).not.toContain("flip");
    expect(alreadySaid(rows)).toEqual([["Not pressed: Switch the setting already showed the asked state",{ reason: "already_in_state", subject: "Switch the setting" }]]);
  });

  it("is an ordinary press when the domain says nothing of the kind", async () => {
    const current = page();
    const { result, rows } = await withRows(() => framedRun(line("graph.main", [flip()]), pageOptions(current)));
    expect(result.trace.attempts.find((attempt) => attempt.nodeId === "flip")?.skipped).toBeUndefined();
    expect(current.landed).toEqual(["flip"]);
    // The same press that did act is a completed act: the skip above is what kept it out.
    expect([...result.invocation.run.lifecycle.completedActs.values()].map((done) => done.nodeId)).toContain("flip");
    expect(alreadySaid(rows)).toEqual([]);
  });

  it("marks only a succeeded attempt whose outputs say exactly already_in_state", () => {
    const base: AutomationStudioNodeAttemptTrace = { attemptId: "n.attempt.1", nodeId: "n", definitionId: "web.output.dom-click", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: { skipped: "already_in_state" }, effects: [] };
    expect(automationStudioAttemptAlreadyInState(base).skipped).toEqual({ reason: "already_in_state", code: "executor.act.already_in_state" });
    expect(automationStudioAttemptAlreadyInState({ ...base, status: "failed" }).skipped).toBeUndefined();
    expect(automationStudioAttemptAlreadyInState({ ...base, outputs: { skipped: "something_else" } }).skipped).toBeUndefined();
    // As a client action is dispatched, its result payload sits under the outputs' `result` (`io-policy.ts`).
    expect(automationStudioAttemptAlreadyInState({ ...base, outputs: { ok: true, result: { skipped: "already_in_state" } } }).skipped).toEqual({ reason: "already_in_state", code: "executor.act.already_in_state" });
    expect(automationStudioAttemptAlreadyInState({ ...base, outputs: { ok: true, result: { skipped: "other" } } }).skipped).toBeUndefined();
    const absent = { ...base, skipped: { reason: "target_absent" as const, code: "web.target.not_found" } };
    expect(automationStudioAttemptAlreadyInState(absent)).toBe(absent);
  });
});
