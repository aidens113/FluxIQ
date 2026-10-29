// A record output the model left parts out of is declared from the plan part
// the step serves (K5), and only what is missing: what the model wrote stands,
// and a step that serves no part is read exactly as before.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapRecordOutputIssues } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, type AuthoringPartAnswer } from "../index.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};
const definitions = webDomainNodeDefinitionsFixture();
const extractListDefinition = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;
const registry = new AutomationStudioNodeRegistry(definitions);

const READ = JSON.stringify({ item: "li.entry", fields: { title: ".t", amount: ".a", link: "a@href" } });
const STEP = "main-s1";

function readStep(extra: string[] = []): string[] {
  return ["step: Read the list", "  node: web.dom.extract_list", `  extractList: ${READ}`, ...extra];
}

function recordOutput(part: AuthoringPartAnswer | undefined, extra: string[] = []): JsonObject {
  const accepted = acceptAutomationStudioFlowBootstrapResult({
    result: { flow: ["flow: Read the list", ...readStep(extra)].join("\n") },
    registry,
    resolution,
    partOf: (stepId) => (stepId === STEP ? part : undefined)
  });
  if (!accepted.ok) throw new Error(`refused: ${accepted.issues.map((issue) => `${issue.code} ${issue.path}`).join(", ")}`);
  return accepted.plan.subflows[0]!.nodes[0]!.parameters!.recordOutput as JsonObject;
}

const fieldIds = (output: JsonObject): JsonValue[] => ((output.schema as JsonObject).fields as JsonObject[]).map((field) => field.id!);

const PART: AuthoringPartAnswer = { id: "listing", label: "Listed entries", columns: ["Amount", "title"], rowIdentity: ["title"] };

describe("a record output derived from the part the step serves", () => {
  it("with no part is byte-identical to a read that was given no resolver", () => {
    const withoutPart = recordOutput(undefined);
    const bare = acceptAutomationStudioFlowBootstrapResult({ result: { flow: ["flow: Read the list", ...readStep()].join("\n") }, registry, resolution });
    if (!bare.ok) throw new Error("refused");
    expect(JSON.stringify(withoutPart)).toBe(JSON.stringify(bare.plan.subflows[0]!.nodes[0]!.parameters!.recordOutput));
    expect(withoutPart).toMatchObject({ datasetId: "read-the-list-main-s1", label: "Read the list" });
    expect(withoutPart.process).toBeUndefined();
  });

  it("declares id, label, schema, columns and dedupe from the answer", () => {
    const output = recordOutput(PART);

    expect(output).toMatchObject({ datasetId: "listing-main-s1", label: "Listed entries", writeMode: "append" });
    expect(fieldIds(output)).toEqual(["amount", "title"]);
    expect(output.process).toEqual({ columns: ["amount", "title"], dedupe: { by: ["title"] } });
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractListDefinition, output)).toEqual([]);
  });

  it("leaves dedupe to the whole row when no row identity is reported, or none of it is stored", () => {
    expect((recordOutput({ ...PART, rowIdentity: undefined }).process as JsonObject).dedupe).toBeUndefined();
    expect((recordOutput({ ...PART, rowIdentity: ["link"] }).process as JsonObject).dedupe).toBeUndefined();
  });

  it("never overrides what the model wrote", () => {
    const written = recordOutput(PART, [`  recordOutput: ${JSON.stringify({ datasetId: "mine", label: "Mine", process: { dedupe: false, columns: ["title"] } })}`]);

    expect(written).toMatchObject({ datasetId: "mine", label: "Mine" });
    expect(written.process).toEqual({ dedupe: false, columns: ["title"] });
  });

  it("fills only the process keys the model left out", () => {
    const output = recordOutput(PART, [`  recordOutput: ${JSON.stringify({ process: { limit: 5 } })}`]);

    expect(output.process).toEqual({ limit: 5, columns: ["amount", "title"], dedupe: { by: ["title"] } });
  });

  it("does not drop a column a written where tests", () => {
    const output = recordOutput({ ...PART, columns: ["amount"] }, [`  recordOutput: ${JSON.stringify({ schema: ["amount", "title"], process: { where: [{ field: "title", contains: "x" }] } })}`]);

    expect((output.process as JsonObject).columns).toBeUndefined();
  });

  it("keeps a field the processing sorts or tests though the answer hides it", () => {
    const narrow: AuthoringPartAnswer = { id: "listing", columns: ["amount"] };
    const sorted = recordOutput(narrow, [`  recordOutput: ${JSON.stringify({ process: { sort: [{ field: "title", order: "desc" }] } })}`]);

    expect(fieldIds(sorted)).toEqual(["amount", "title"]);
    expect((sorted.process as JsonObject).columns).toEqual(["amount"]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractListDefinition, sorted)).toEqual([]);
    expect(fieldIds(recordOutput(narrow))).toEqual(["amount"]);
    // A field the model wrote a schema for, or one the step does not read, is left as it is.
    const written = recordOutput(narrow, [`  recordOutput: ${JSON.stringify({ schema: ["amount"], process: { sort: [{ field: "title", order: "desc" }] } })}`]);
    expect(fieldIds(written)).toEqual(["amount"]);
  });
});
