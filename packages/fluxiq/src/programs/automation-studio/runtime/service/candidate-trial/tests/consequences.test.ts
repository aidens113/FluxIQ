// A trial gates a step's declared consequences exactly as a normal run of the
// saved Flow does (t340, written before the runner existed).
//
// Neither the graph executor nor its options carry `permittedConsequences`: a
// normal run is gated per lasting consequence when the Flow is authored and
// approved, and then executes with the options `automationStudioRunGraphOptions`
// builds. So "the same gate" means: the trial runs the candidate under those
// same options, adds no permission of its own and removes none, and the native
// executor is asked exactly what a normal run of the promoted graph asks it.

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../composite-executor.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../../../flow-bootstrap/index.ts";
import { automationStudioRunGraphOptions } from "../../runtime-session/index.ts";
import { runAutomationStudioCandidateTrial } from "../index.ts";
import { trialFixture } from "./fixtures.ts";

type Asked = { declared: JsonValue | undefined; sideEffectClass: string | undefined; authorizedDomains: string[] };

function recordingOptions(signal: AbortSignal, asked: Asked[]): AutomationStudioGraphExecutionOptions {
  const options = automationStudioRunGraphOptions({ signal, authorizedDomainIds: ["example"], maxSteps: 20 });
  options.authorizedDomainIds = ["example"];
  options.nativeNodeExecutor = async ({ node, hostContext }) => {
    asked.push({ declared: node.metadata?.declaredConsequences as JsonValue | undefined, sideEffectClass: hostContext?.sideEffectClass, authorizedDomains: [...(options.authorizedDomainIds ?? [])] });
    return { result: { status: "success", route: "success", outputs: {} } };
  };
  return options;
}

describe("a candidate trial and a normal run gate declared consequences alike", () => {
  it.each([["move_money"], ["delete"], ["send_or_publish"], ["create_new"], []])("a press declaring %j is asked of the native executor the same way", async (...consequences) => {
    const fixture = trialFixture(consequences);
    // The normal run: the promoted graph, as applying the adaptation stores it, run through the canonical executor with a run's options.
    const normal: Asked[] = [];
    const topology = normalizeAutomationStudioFlowBuildPlan({ adaptationId: "adaptation.bootstrap.1", parentFlow: fixture.parentFlow, buildPlan: fixture.buildPlan, sourceInstructionIds: ["instruction"], now: 1 });
    const ran = await runCanonicalAutomationStudioFlow(topology.subflows[0]!.graphFlow, [], recordingOptions(new AbortController().signal, normal), []);
    expect(ran.status).toBe("succeeded");

    // The trial: the same candidate, under the same options builder.
    const trial: Asked[] = [];
    let handed: AutomationStudioGraphExecutionOptions | undefined;
    fixture.ports.graphOptions = ({ signal }) => (handed = recordingOptions(signal, trial));
    let received: AutomationStudioGraphExecutionOptions | undefined;
    fixture.ports.execute = async (input) => { received = input.options; const { runAutomationStudioDetachedCandidate } = await import("../../../flow-bootstrap/verification/index.ts"); return runAutomationStudioDetachedCandidate(input); };
    const outcome = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);

    expect(outcome.record.execution).toBe("succeeded");
    expect(trial).toEqual(normal);
    expect(trial).toHaveLength(1);
    // The trial handed the detached runner the run's own options: no permission, gate or dispatcher of its own.
    expect(received).toBe(handed);
    expect(Object.keys(received!).sort()).toEqual(Object.keys(handed!).sort());
    expect(received).not.toHaveProperty("permittedConsequences");
  });
});
