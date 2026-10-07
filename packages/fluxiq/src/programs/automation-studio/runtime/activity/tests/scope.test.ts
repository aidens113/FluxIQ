import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { bindAutomationStudioActivityRun } from "../bind.ts";
import { withAutomationStudioBuildActivity } from "../build.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { withAutomationStudioRunActivity } from "../run.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";
import { emitAutomationStudioActivityStep } from "../step/index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

describe("activity scope", () => {
  it("emits nothing outside a scope", () => {
    emitAutomationStudioActivity({ phase: "thinking", label: "Deciding the next step" });
    expect(seen).toEqual([]);
  });

  it("publishes under the scope's unit of work, across awaits", async () => {
    await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1", flowId: "f1", conversationId: "c1" }, async () => {
      await Promise.resolve();
      emitAutomationStudioActivity({ phase: "thinking", label: "Deciding the next step" });
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p1", flowId: "f1" }, conversationId: "c1", phase: "thinking" });
  });

  it("keeps concurrent scopes apart", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    await Promise.all(["a", "b"].map((id) => runWithAutomationStudioActivity({ kind: "run", id, projectId: "p1" }, async () => {
      await tick();
      emitAutomationStudioActivity({ phase: "running", label: `in ${id}` });
    })));
    expect(seen.map((event) => [event.subject.id, event.label]).sort()).toEqual([["a", "in a"], ["b", "in b"]]);
  });

  it("holds a pending run back until it is bound, then says it started", async () => {
    await runWithAutomationStudioActivity({ kind: "run", id: "", projectId: "p1" }, async () => {
      emitAutomationStudioActivity({ phase: "running", label: "too early" });
      bindAutomationStudioActivityRun("run-7");
      emitAutomationStudioActivityStep({ index: 2, count: 5, nodeId: "n2", label: " Open list " });
      emitAutomationStudioActivityStep({ index: 6, count: 5, nodeId: "n3" });
    }, { pending: true });
    expect(seen.map((event) => event.label)).toEqual(["Run started", "Running step 2 of 5: Open list", "Running step 6"]);
    expect(seen.every((event) => event.activityId === "run:run-7")).toBe(true);
    expect(seen[1]!.step).toEqual({ index: 2, count: 5, nodeId: "n2", label: "Open list" });
    expect(seen[2]!.detail).toMatchObject({ title: "Step 6", ref: "n3" });
  });

  it("says which node a step runs, as the record a tool row carries, so a card can tell a merge from a press (U-A2)", async () => {
    await runWithAutomationStudioActivity({ kind: "run", id: "run-8", projectId: "p1" }, async () => {
      emitAutomationStudioActivityStep({ index: 3, count: 9, nodeId: "n3", definitionId: "builtin.control.merge" });
      emitAutomationStudioActivityStep({ index: 4, count: 9, nodeId: "n4" });
    });
    const steps = seen.filter((event) => event.step !== undefined);
    expect(steps[0]!.detail).toMatchObject({ ref: "n3", text: "Node: builtin.control.merge" });
    expect(steps[1]!.detail?.text).toBeUndefined();
  });
});

describe("withAutomationStudioBuildActivity", () => {
  it("says building at start and done at settle, returning the result", async () => {
    const result = await withAutomationStudioBuildActivity({ projectId: "p1", flowId: "f1" }, async () => "built");
    expect(result).toBe("built");
    expect(seen.map((event) => event.phase)).toEqual(["building", "done"]);
    expect(seen[1]!.final).toBe(true);
    expect(seen[0]!.activityId).toBe(seen[1]!.activityId);
  });

  // t174-w108 D9 (`run-musp8nz1-dbd3905a`, screenshot 00011): the overlay read
  // "Flow ready / Build finished: a Flow is proposed"; "proposed" meant nothing
  // to the person, and the Flow ran a second later.
  it("says a finished build in plain words", async () => {
    await withAutomationStudioBuildActivity({ projectId: "p1" }, async () => "built");
    expect(seen[1]).toMatchObject({ phase: "done", label: "Your Flow is ready", detail: { title: "Build finished", status: "succeeded" } });
    expect(JSON.stringify(seen)).not.toMatch(/proposed/u);
  });

  it("says failed and rethrows the same error", async () => {
    const error = new Error("refused");
    await expect(withAutomationStudioBuildActivity({ projectId: "p1" }, async () => { throw error; })).rejects.toBe(error);
    expect(seen.map((event) => [event.phase, event.final])).toEqual([["building", undefined], ["failed", true]]);
  });

  it("says why a build that could not finish ended, in the message written for the person", async () => {
    const message = "I could not build this Flow, and I found no way to: 1 of the 2 things you asked could not be done.";
    const notDoable = Object.assign(new Error("x"), { diagnostic: { code: "flow_bootstrap.not_doable", ending: { kind: "not_doable", message } } });
    await expect(withAutomationStudioBuildActivity({ projectId: "p1" }, async () => { throw notDoable; })).rejects.toBe(notDoable);
    expect(seen[1]).toMatchObject({ phase: "failed", final: true, label: "Not doable: this Flow could not be built", detail: { title: "Not doable: this Flow could not be built", text: message, status: "failed" } });

    const budget = Object.assign(new Error("y"), { diagnostic: { code: "flow_bootstrap.evidence_budget_exhausted", ending: { kind: "budget_exhausted", message: "The build stopped at its spending limit of $0.25." } } });
    await expect(withAutomationStudioBuildActivity({ projectId: "p1" }, async () => { throw budget; })).rejects.toBe(budget);
    expect(seen[3]).toMatchObject({ label: "Build stopped: a budget ran out", detail: { text: "The build stopped at its spending limit of $0.25." } });

    // No "model" in what the person reads (t195-w48).
    const unreadable = Object.assign(new Error("z"), { diagnostic: { code: "flow_bootstrap.model_replies_unreadable", ending: { kind: "replies_unreadable", message: "The build stopped because the replies it got back could not be read." } } });
    await expect(withAutomationStudioBuildActivity({ projectId: "p1" }, async () => { throw unreadable; })).rejects.toBe(unreadable);
    expect(seen[5]).toMatchObject({ label: "Build stopped: the replies it got back could not be read", detail: { title: "Build stopped: the replies it got back could not be read" } });
    expect(seen[5]!.label).not.toMatch(/model/u);
  });

  it("runs unobserved without a usable project", async () => {
    expect(await withAutomationStudioBuildActivity({ projectId: 42 }, async () => 1)).toBe(1);
    expect(seen).toEqual([]);
  });
});

describe("withAutomationStudioRunActivity", () => {
  const settle = (status: string) => withAutomationStudioRunActivity({ projectId: "p1", flowId: "f1" }, async () => {
    bindAutomationStudioActivityRun("r1");
    return { status };
  });

  it("maps a settled session status onto its phase", async () => {
    await settle("succeeded");
    await settle("failed");
    await settle("cancelled");
    await settle("waiting");
    await settle("running");
    expect(seen.filter((event) => event.label !== "Run started").map((event) => [event.phase, event.final ?? false])).toEqual([
      ["done", true], ["failed", true], ["failed", true], ["waiting_permission", false]
    ]);
  });

  it("emits nothing for a run that returns before it is bound", async () => {
    await withAutomationStudioRunActivity({ projectId: "p1" }, async () => ({ status: "succeeded" }));
    expect(seen).toEqual([]);
  });

  it("says failed on a throw once bound, and rethrows", async () => {
    const error = new Error("boom");
    await expect(withAutomationStudioRunActivity({ projectId: "p1" }, async () => { bindAutomationStudioActivityRun("r2"); throw error; })).rejects.toBe(error);
    expect(seen.map((event) => event.phase)).toEqual(["running", "failed"]);
  });

  it("ends a failed run with what came back and why, read from the run's record (U3, run-musp39u8-9ac026ab)", async () => {
    const record = {
      resultVerification: { status: "refuted", performed: true, verdict: "does_not_answer", code: "core.result.does_not_answer_request", observation: "13 records stored, across 1 record set", reason: "Two products with the Plus badge were left out." },
      resultRepair: { attempted: true, attempts: 1, history: [{ attempt: 1, totalRecordCount: 13 }], phase: "settled", outcome: "not_rerun" },
      resultReauthor: { code: "flow_bootstrap.evidence_budget_exhausted", attempts: [{ attempt: 1, ending: { kind: "budget_exhausted", bound: "rounds", tried: { tested: "not_tested" } } }] }
    };
    const read: string[] = [];
    await withAutomationStudioRunActivity({ projectId: "p1" }, async () => { bindAutomationStudioActivityRun("r4"); return { status: "failed", runId: "r4" }; }, {
      readRecord: async (session) => { read.push(session.runId); return record; }
    });
    // U-10 (t276): the ending says the run saved its rows, after a lower-case opening (`./wording/run-ending.ts`).
    const sentence = "it saved 13 rows, but the check found they don't answer what you asked, and the fix ran out of build rounds before it could test a change.";
    expect(read).toEqual(["r4"]);
    // R3-U-3: the check's reason follows in the row's text; the status line keeps the ending alone.
    expect(seen.at(-1)).toMatchObject({ phase: "failed", final: true, label: `Run failed: ${sentence}`, detail: { kind: "step", title: "Run failed", status: "failed", text: `${sentence} The check said: Two products with the Plus badge were left out.` } });
  });

  it("falls back to the session's own record, and to a bare \"Run failed\" when the record cannot be read", async () => {
    const metadata = { resultVerification: { status: "refuted", performed: true, verdict: "does_not_answer", observation: "2 records stored" } };
    await withAutomationStudioRunActivity({ projectId: "p1" }, async () => { bindAutomationStudioActivityRun("r5"); return { status: "failed", metadata }; });
    expect(seen.at(-1)).toMatchObject({ label: "Run failed: it saved 2 rows, but the check found they don't answer what you asked." });
    await withAutomationStudioRunActivity({ projectId: "p1" }, async () => { bindAutomationStudioActivityRun("r6"); return { status: "failed" }; }, { readRecord: async () => { throw new Error("store closed"); } });
    expect(seen.at(-1)).toMatchObject({ label: "Run failed", detail: { title: "Run failed", status: "failed" } });
    expect(seen.at(-1)!.detail).not.toHaveProperty("text");
  });

  it("runs unobserved without a project", async () => {
    await withAutomationStudioRunActivity({ projectId: null }, async () => { bindAutomationStudioActivityRun("r3"); return { status: "succeeded" }; });
    expect(seen).toEqual([]);
  });
});
