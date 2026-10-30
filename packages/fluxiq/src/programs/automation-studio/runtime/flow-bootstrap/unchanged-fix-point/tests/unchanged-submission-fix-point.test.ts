// The first refusal of a refuted Flow carries what differs and where the record points (P1a item 3).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../candidate/index.ts";

const inspect: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }, { id: "recordOutput", label: "Record output", valueType: "object" }]
};
const base = { projectId: "project.test", flowId: "flow.test", registry: new AutomationStudioNodeRegistry([inspect]), resolution: { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] }, baseDependencyDigest: "accepted.base" };

const script = (text: string, dataset = "rows", label = "inspect the value"): JsonObject => ({
  summary: "Inspect", flow: ["flow: Inspect", `step: ${label}`, "  node: domain.demo.inspect", `  text: ${text}`, `  recordOutput: {"datasetId": "${dataset}"}`].join("\n")
});

async function refutedSetup(finding: JsonObject) {
  const controller = new AutomationStudioFlowCandidateSubmissionController(base);
  const first = await controller.submit(script("hello"));
  if (!first.ok) throw new Error(JSON.stringify(first));
  const history = { refuted: (digest: string) => (digest === first.candidate.digest ? finding : undefined) };
  return { controller, history };
}

const finding: JsonObject = { said: "no", steps: [{ step: 1, status: "failed", label: "inspect the value" }] };

async function refusal(controller: AutomationStudioFlowCandidateSubmissionController, input: JsonObject, history: { refuted: (digest: string) => JsonObject | undefined }) {
  const result = await controller.submit(input, history);
  if (result.ok) throw new Error("accepted");
  return result.check;
}

describe("the first unchanged_after_no", () => {
  it("carries diff and fixPoint, and its instruction points to them; the second keeps today's shape", async () => {
    const { controller, history } = await refutedSetup(finding);
    const one = await refusal(controller, script("hello"), history);
    expect(one.issueCodes).toEqual(["candidate.unchanged_after_no"]);
    expect(one.feedback).toMatchObject({ diff: { identical: true }, fixPoint: [{ step: 1, label: "inspect the value" }] });
    expect(String(one.feedback.instruction)).toContain("`diff`");
    expect(String(one.feedback.instruction)).toContain("`fixPoint`");
    const two = await refusal(controller, script("hello"), history);
    expect(two.feedback).not.toHaveProperty("diff");
    expect(two.feedback).not.toHaveProperty("fixPoint");
    expect(String(two.feedback.instruction)).not.toContain("`diff`");
  });

  it("describes a datasetId-only rename in diff", async () => {
    const { controller, history } = await refutedSetup(finding);
    const one = await refusal(controller, script("hello", "rows-renamed"), history);
    expect(one.issueCodes).toEqual(["candidate.unchanged_after_no"]);
    expect(one.feedback.diff).toMatchObject({ identical: false, datasetIdRenamed: [{ step: 1, was: "rows", now: "rows-renamed" }] });
  });

  it("omits fixPoint when the record names no step", async () => {
    const { controller, history } = await refutedSetup({ said: "no" });
    const one = await refusal(controller, script("hello"), history);
    expect(one.feedback).toHaveProperty("diff");
    expect(one.feedback).not.toHaveProperty("fixPoint");
  });

  it("leaves unchanged_submission as it was when no finding was judged", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(base);
    await controller.submit(script("hello"));
    const again = await refusal(controller, script("hello"), { refuted: () => undefined });
    expect(again.issueCodes).toEqual(["candidate.unchanged_submission"]);
    expect(again.feedback).not.toHaveProperty("diff");
    expect(again.feedback).not.toHaveProperty("fixPoint");
  });
});
