// Stop, Take over and Hand back tell the rest of the panel the run moved
// (`runtime-run.changed`), so a run list or a run view open beside the chat
// reads at once. A build stopped through its Flow names no run, and tells nobody.

import { describe, expect, it } from "vitest";
import { subscribeToAutomationStudioMutations } from "../../../automation-studio/stores";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createRunPort } from "../run-port";

function running(answers: Parameters<typeof fakeProgramApi>[0]) {
  const heard: unknown[] = [];
  const stop = subscribeToAutomationStudioMutations((transaction) => heard.push(transaction.mutation), { kinds: ["runtime-run.changed"] });
  return { port: createRunPort(fakeProgramApi(answers), { projectId: () => "p1" }), heard, stop };
}

describe("the run port tells the panel a run moved", () => {
  it("after a run is stopped, taken over or handed back", async () => {
    const { port, heard, stop } = running({
      "cancel-runtime-session": { ok: true, payload: { cancellationRequested: true } },
      "pause-runtime-session": { ok: true, payload: {} },
      "resume-runtime-session": { ok: true, payload: {} }
    });
    await port.stop({ projectId: "p1", runId: "run-1" });
    await port.takeOver({ projectId: "p1", runId: "run-2" });
    await port.handBack({ projectId: "p1", runId: "run-3" });
    stop();
    expect(heard).toEqual([
      { kind: "runtime-run.changed", projectId: "p1", runId: "run-1" },
      { kind: "runtime-run.changed", projectId: "p1", runId: "run-2" },
      { kind: "runtime-run.changed", projectId: "p1", runId: "run-3" }
    ]);
  });

  it("for each run a project-wide stop cancelled, and not for one Core refused", async () => {
    const { port, heard, stop } = running({
      "list-runtime-sessions": { ok: true, payload: { runtimeSessions: [{ runId: "run-1", status: "running" }, { runId: "run-2", status: "waiting" }] } },
      "cancel-runtime-session": (payload) => (payload?.runId === "run-2" ? { ok: false, status: 409, error: "Already over." } : { ok: true, payload: {} })
    });
    expect(await port.stop({ projectId: "p1" })).toMatchObject({ ok: false });
    stop();
    expect(heard).toEqual([{ kind: "runtime-run.changed", projectId: "p1", runId: "run-1" }]);
  });

  it("not for a build stopped through its Flow, nor when Core refuses", async () => {
    const { port, heard, stop } = running({
      "cancel-flow-bootstrap": { ok: true, payload: { cancellationRequested: true } },
      "pause-runtime-session": { ok: false, status: 409, error: "Not running." }
    });
    await port.stop({ projectId: "p1", flowId: "flow-1" });
    await port.takeOver({ projectId: "p1", runId: "run-9" });
    stop();
    expect(heard).toEqual([]);
  });
});
