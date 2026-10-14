import { describe, expect, it } from "vitest";
import { candidateSubflowFixture } from "../../../flow-bootstrap/verification/tests/subflow-fixture.ts";
import { runAutomationStudioCandidateTrial } from "../run.ts";
import { trialFixture } from "./fixtures.ts";

describe("the ordinary detached candidate trial with called parts", () => {
  it("attributes nested acted steps and graph definitions to judge/reset feedback exactly once", async () => {
    const source = candidateSubflowFixture();
    source.plan.subflows[2]!.nodes[1]!.consequences = ["modify_existing"];
    source.recompile();
    const fixture = trialFixture();
    fixture.candidate.buildPlan = source.input.candidate.buildPlan;
    if (source.input.registry) fixture.ports.registry = source.input.registry;
    fixture.ports.resolution = source.input.resolution;
    fixture.ports.parentFlow = async () => source.input.parentFlow;
    fixture.ports.deniedEvidenceKeys = ["value"];
    fixture.ports.graphOptions = ({ signal }) => ({ ...source.input.options, signal, now: () => 100 });
    const result = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result.result.verdict).toBe("yes");
    expect(source.seen).toEqual([11, 22, { first: 11, second: 22 }]);
    expect(result.result.acts).toHaveLength(2);
    expect(result.result.acts?.map((act) => act.step)).toEqual([6, 11]);
    const summary = fixture.judged[0]!.summary;
    expect(summary.flowShape.filter((step) => step.definitionId === "test.echo")).toHaveLength(2);
    expect(summary.flowShape.filter((step) => step.definitionId === "test.echo").every((step) => !Object.hasOwn(step.parameters ?? {}, "value"))).toBe(true);
    expect(summary.totalRecordCount).toBe(0);
    const nativeSteps = (result.result.feedback.steps as Array<{ definitionId: string; status: string }>).filter((step) => step.definitionId === "test.echo");
    expect(nativeSteps).toHaveLength(3);
    expect(nativeSteps.every((step) => step.status === "succeeded")).toBe(true);
  });
});
