import { expect, it } from "vitest";
import { automationObservationFixture } from "../execution-admission/tests/fixture.ts";
import { resumeAutomationStudioGraph } from "../resume.ts";
import { runAutomationStudioGraph } from "../graph-run.ts";
import { createExecutionAdmissionAuthority } from "../../../runtime/execution-admission/index.ts";

const flow = { schemaVersion: "0.1" as const, flowId: "flow.resume-properties", ownerKind: "routine" as const, ownerId: "routine.resume-properties", name: "Resume", createdAt: 1, updatedAt: 1, nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "ask", definitionId: "builtin.routine.approval", parameterValues: { prompt: "Continue?" } }], edges: [{ id: "e", sourceNodeId: "start", targetNodeId: "ask", sourcePortId: "success", targetPortId: "in" }] };

it.each(["own", "inherited"] as const)("enters the actual resume kernel before refusing a %s clock getter", async placement => {
  const trace = await runAutomationStudioGraph(flow, { now: () => 10 });
  expect(trace.parked).toBeDefined();
  const f = await automationObservationFixture();
  let reads = 0;
  const owner = placement === "own" ? f.options : {};
  if (placement === "inherited") Object.setPrototypeOf(f.options, owner);
  Object.defineProperty(owner, "now", { get() {
    reads++;
    return () => 11;
  } });
  await expect(resumeAutomationStudioGraph({ flow, trace, resumption: { kind: "answer", answer: { askId: trace.parked!.ask.askId, kind: "grant", answeredAt: 11, value: null, actorId: null } }, options: f.options })).rejects.toThrow();
  expect(reads).toBe(0);
  expect([...f.store.rows.values()].some(row => row.row.sourceKey === "automation.engine")).toBe(true);
  await f.authority.consumer.release(f.reserved.reservation);
  const reopened = createExecutionAdmissionAuthority({ persistence: f.store, scopes: f.scopes });
  const scope = await reopened.openScope(f.scopes.issue());
  expect((await reopened.consumer.inspect(scope)).state).toBe("pending");
});
