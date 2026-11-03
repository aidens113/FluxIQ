import { describe, expect, it } from "vitest";
import { automationStudioChildInvocation } from "../../frames/index.ts";
import { automationStudioAttemptFailureClass, closeAutomationStudioRecoveryIncident, markAutomationStudioIncidentFailure, openAutomationStudioRecoveryIncident } from "../index.ts";
import { flowWith, framed } from "./lifecycle-fixtures.ts";

describe("the run's incident ledger", () => {
  it("opens one incident per node arrival, carries it across a frame boundary, and closes it", () => {
    const invocation = framed(flowWith("graph.main", []));
    const first = openAutomationStudioRecoveryIncident(invocation.run, { invocationId: "invocation-1", nodeId: "press", arrival: 1, failureCode: "action.blocked", at: 10 });
    expect(first).toEqual({ incidentId: "incident-1", origin: { framePath: ["invocation-1"], nodeId: "press", failureCode: "action.blocked" }, handlersRun: [], routes: [], alternatives: [], startedAt: 10 });
    expect(invocation.frame.incidentId).toBe("incident-1");
    // A later retry of the same arrival keeps the incident; a new arrival opens another.
    expect(openAutomationStudioRecoveryIncident(invocation.run, { invocationId: "invocation-1", nodeId: "press", arrival: 1, failureCode: "other", at: 20 })).toBe(first);
    expect(openAutomationStudioRecoveryIncident(invocation.run, { invocationId: "invocation-1", nodeId: "press", arrival: 2, failureCode: "x", at: 30 }).incidentId).toBe("incident-2");

    // A child's incident becomes its Call Subflow node's in the parent: the same record.
    const child = automationStudioChildInvocation(invocation, { callNodeId: "press", subflowId: "child", graph: flowWith("graph.child", []), graphRevision: 1, inputs: {} })!;
    invocation.run.stack.push(child.frame);
    const inChild = openAutomationStudioRecoveryIncident(invocation.run, { invocationId: child.frame.invocationId, nodeId: "press", arrival: 1, failureCode: "y", at: 40 });
    expect(inChild.origin.framePath).toEqual(["invocation-1", "invocation-2"]);
    invocation.run.stack.pop();
    const carried = openAutomationStudioRecoveryIncident(invocation.run, { invocationId: "invocation-1", nodeId: "call", arrival: 1, failureCode: "subflow", at: 50, carriedIncidentId: inChild.incidentId });
    expect(carried).toBe(inChild);
    expect(invocation.frame.incidentId).toBe(inChild.incidentId);

    closeAutomationStudioRecoveryIncident(invocation.run, inChild.incidentId);
    expect(invocation.frame.incidentId).toBeUndefined();
    expect(invocation.run.lifecycle.incidents.get(inChild.incidentId)).toBe(inChild);
    expect([...invocation.run.lifecycle.openByArrival.values()]).not.toContain(inChild.incidentId);
  });

  it("marks a true failure on the incident, and gives graph-run the attempt's failure class", () => {
    const invocation = framed(flowWith("graph.main", []));
    const incident = openAutomationStudioRecoveryIncident(invocation.run, { invocationId: "invocation-1", nodeId: "press", arrival: 1, failureCode: "f", at: 1 });
    const edgePath = { kind: "edge" as const, edgeId: "e", targetNodeId: "n", deliberateStop: false };
    expect(markAutomationStudioIncidentFailure(invocation.run, incident.incidentId, { uncertainAct: false, onFail: [edgePath] })).toEqual({ verdict: "planned_fail", failureClass: "planned_fail" });
    expect(incident.trueFailure).toBeUndefined();
    expect(markAutomationStudioIncidentFailure(invocation.run, incident.incidentId, { uncertainAct: false, onFail: [{ kind: "handler", handlerId: "h", when: "true" }] })).toEqual({ verdict: "on_fail_pending" });
    expect(markAutomationStudioIncidentFailure(invocation.run, incident.incidentId, { uncertainAct: false, onFail: [{ kind: "handler", handlerId: "h", when: "true", outcome: "unhandled" }] })).toEqual({ verdict: "true_failure", failureClass: "true_failure" });
    expect(incident.trueFailure).toBe(true);
    expect(automationStudioAttemptFailureClass({ uncertainAct: false, movedBy: "retry", onFail: [] })).toBe("retry");
    expect(automationStudioAttemptFailureClass({ uncertainAct: true, onFail: [] })).toBe("uncertain");
  });
});
