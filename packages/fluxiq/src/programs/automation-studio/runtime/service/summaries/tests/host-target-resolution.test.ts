// The host's own target resolution, from the dispatched result to the run
// detail a finished run is read from.
//
// The two records both called a target resolution are the point of these
// tests. Core's is its pre-dispatch choice of candidate and already travels.
// The host's is what the browser did once the command arrived, and it names
// the `strategy` it found the element by -- which is the only evidence of the
// recovery that has no ladder rung, because the browser re-resolves a renamed
// control before Core is ever told the action failed. It reached Core on the
// dispatched result's payload and stopped there.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../../io/index.ts";
import { RuntimeService } from "../../../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../../executor.ts";
import { createRuntimePolicyEffectDispatcher } from "../../../io-policy.ts";
import { runtimeSessionToFlowRunDetail } from "../../index.ts";
import { hostTargetResolutionFromOutputs } from "../host-target-resolution.ts";

describe("the host's target resolution on a saved attempt", () => {
  it("reaches the run detail beside Core's own, naming the strategy the browser found the element by", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.click",
      status: "succeeded",
      resolution: { strategy: "scored-candidate", candidateCount: 4, bestScore: 0.389, runnerUpScore: 0.1, confidence: 0.366 }
    });

    // Core's own record says it applied no floor, because the Flow supplied no
    // candidates. That is a different fact from the one below, and both are
    // kept: a reader has to be able to tell Core's pre-dispatch choice from
    // what the browser actually did.
    expect(detail.actionAttempts?.[0]?.metadata?.hostTargetResolution).toEqual({
      strategy: "scored-candidate",
      candidateCount: 4,
      bestScore: 0.389,
      runnerUpScore: 0.1,
      confidence: 0.366
    });
  });

  it("keeps an exact resolution's two members and invents no scores for it", async () => {
    const detail = await runDetailFor({ commandId: "command.runtime", status: "succeeded", resolution: { strategy: "selector", candidateCount: 1 } });

    expect(detail.actionAttempts?.[0]?.metadata?.hostTargetResolution).toEqual({ strategy: "selector", candidateCount: 1 });
  });

  it("carries nothing when the host reported no resolution, rather than an empty record", async () => {
    const detail = await runDetailFor({ commandId: "command.runtime", status: "succeeded", url: "https://example.test/" });

    expect(detail.actionAttempts?.[0]?.metadata).not.toHaveProperty("hostTargetResolution");
  });
});

describe("what the projection admits", () => {
  // The payload arrives from a downstream host and is parsed, not typed, so
  // each of these is a value that could arrive and must not be republished.
  it("refuses a strategy this Core does not know, so a member the domain adds stays behind until it is named", () => {
    expect(hostTargetResolutionFromOutputs({ result: { resolution: { strategy: "telepathy", candidateCount: 1 } } })).toBeUndefined();
  });

  it("refuses a record whose candidate count is not a count", () => {
    expect(hostTargetResolutionFromOutputs({ result: { resolution: { strategy: "selector", candidateCount: "one" } } })).toBeUndefined();
    expect(hostTargetResolutionFromOutputs({ result: { resolution: { strategy: "selector", candidateCount: -1 } } })).toBeUndefined();
  });

  it("drops a score outside the ratio the host reports, and keeps the rest of the record", () => {
    expect(hostTargetResolutionFromOutputs({ result: { resolution: { strategy: "fingerprint", candidateCount: 2, bestScore: 12, confidence: 0.5 } } }))
      .toEqual({ strategy: "fingerprint", candidateCount: 2, confidence: 0.5 });
  });

  it("carries nothing extra the host put beside the five members", () => {
    expect(hostTargetResolutionFromOutputs({ result: { resolution: { strategy: "fingerprint", candidateCount: 2, candidateLabel: "Apply changes" } } }))
      .toEqual({ strategy: "fingerprint", candidateCount: 2 });
  });

  it("finds the record one level further in, where the gateway dispatcher's own wrapper puts it", () => {
    // The route a paired browser client's action actually takes: the domain's
    // gateway output dispatcher answers `{ status, message, result }`, so the
    // action result is nested inside the dispatch payload.
    expect(hostTargetResolutionFromOutputs({ result: { status: "succeeded", message: "Element clicked.", result: { resolution: { strategy: "fingerprint", candidateCount: 3, confidence: 0.4 } } } }))
      .toEqual({ strategy: "fingerprint", candidateCount: 3, confidence: 0.4 });
  });

  it("carries nothing for an attempt that dispatched nothing, or whose result payload was withheld", () => {
    expect(hostTargetResolutionFromOutputs({})).toBeUndefined();
    expect(hostTargetResolutionFromOutputs({ result: "[withheld]" })).toBeUndefined();
    expect(hostTargetResolutionFromOutputs(undefined)).toBeUndefined();
  });
});

/** One dispatched action whose host answered with `payload`, as the run detail states it. */
async function runDetailFor(payload: JsonObject) {
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1",
    flowId: "flow.host-target-resolution",
    ownerKind: "task",
    ownerId: "task.host-target-resolution",
    name: "Host target resolution",
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
    edges: []
  };
  const io = new IoRegistry();
  io.registerOutput("example", defineOutput({
    definition: { id: "activate-element", title: "Activate element" },
    mode: "request",
    dispatch: (request) => ({ ok: true, outputId: request.outputId })
  }));
  const runtime = new RuntimeService();
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
    execute: (command) => ({ commandId: command.commandId ?? "command.runtime", status: "succeeded", payload })
  });
  const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(io, "example", runtime) });
  const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId: "run.host-target-resolution", projectId: "project.host", targetKind: "flow", targetId: flow.flowId, flowId: flow.flowId, status: "succeeded", queuedAt: 1, flow, trace };
  return runtimeSessionToFlowRunDetail(session, "project.host");
}
