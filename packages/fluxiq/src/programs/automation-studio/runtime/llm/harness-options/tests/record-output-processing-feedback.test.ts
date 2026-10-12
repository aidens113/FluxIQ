import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";

const registry = new AutomationStudioNodeRegistry(canonicalBuiltinAutomationNodeDefinitions);

describe("early record-output processing refusal", () => {
  it("refuses an unknown processing key and delivers the supported shape", async () => {
    const result = await checkAutomationStudioFlowBootstrapCompletion({
      projectId: "project.1", flowId: "flow.1", registry,
      resolution: { scope: { kind: "domain", domainId: "sample" }, runtimeCapabilities: [], permissions: [] },
      result: {
        summary: "Save the supplied records",
        plan: {
          schemaVersion: "0.1",
          router: { name: "Save", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
          subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{
            key: "save", definitionId: "builtin.data.write-records", definitionVersion: "1.0.0",
            parameters: { recordOutput: {
              datasetId: "notes", writeMode: "append",
              schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] },
              process: { unique: ["title"] }
            } }
          }], edges: [] }]
        }
      }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.check.issueCodes).toContain("record_output.process_unknown_key");
    const feedback = result.check.feedback as { issues: Array<{ code: string; accepted?: { keys: string[]; shape: string } }> };
    const issue = feedback.issues.find((entry) => entry.code === "record_output.process_unknown_key")!;
    expect(issue.accepted?.keys).toContain("process");
    expect(issue.accepted?.shape).toContain("dedupe: false | {by:[fieldId,...]}");
    for (const key of ["where", "sort", "limit", "columns", "minRows"]) expect(issue.accepted?.shape).toContain(key);
  });
});
