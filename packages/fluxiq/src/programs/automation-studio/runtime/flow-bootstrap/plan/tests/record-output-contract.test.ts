import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  builtinAutomationNodeDefinitions,
  canonicalBuiltinAutomationNodeDefinitions,
  parseAutomationStudioRecordOutput,
  type AutomationStudioNodeDefinition
} from "../../../../nodes/index.ts";
import {
  automationStudioFlowBootstrapRecordOutputContract,
  automationStudioFlowBootstrapRecordOutputIssues,
  automationStudioFlowBootstrapSuppliedRecordsPath
} from "../record-output-contract.ts";
import { webDomainNodeDefinitionsFixture } from "./web-domain-definitions-fixture.ts";

// A live Flow creation wrote the list extraction's record output three times
// and was refused each time for keys the record-set parser does not take: the
// catalog had told the model only "the dataset the rows are saved into". What a
// model is shown now is Core's own record-set contract, checked here against
// the parser that refuses it.

const builtin = (id: string): AutomationStudioNodeDefinition => canonicalBuiltinAutomationNodeDefinitions.find((definition) => definition.id === id)!;
const extractList = webDomainNodeDefinitionsFixture().find((definition) => definition.id === "web.output.dom-extract_list")!;
const policyAction = builtin("builtin.policy.action");
const writeRecords = builtin("builtin.data.write-records");

describe("the record output contract a model is shown", () => {
  it.each([
    ["the list extraction", extractList],
    ["the policy action", policyAction],
    ["the node that writes records", writeRecords]
  ])("gives %s an example the record-set parser accepts", (_label, definition) => {
    const { example } = automationStudioFlowBootstrapRecordOutputContract(definition);

    expect(automationStudioFlowBootstrapRecordOutputIssues(definition, example)).toEqual([]);
  });

  it("offers null only where the node reads it as saving nothing, or as a dataset of its own", () => {
    expect(automationStudioFlowBootstrapRecordOutputContract(extractList).text).toMatch(/^null, or /u);
    expect(automationStudioFlowBootstrapRecordOutputContract(policyAction).condensedText).toMatch(/^null, or /u);
    expect(automationStudioFlowBootstrapRecordOutputContract(writeRecords).text).not.toContain("null");
    expect(automationStudioFlowBootstrapRecordOutputContract(writeRecords).condensedText).not.toContain("null");
  });

  it("leaves the path out of the example only where the node supplies one", () => {
    expect(automationStudioFlowBootstrapRecordOutputContract(extractList).example).not.toHaveProperty("recordsPath");
    expect(automationStudioFlowBootstrapRecordOutputContract(writeRecords).example).not.toHaveProperty("recordsPath");
    expect(automationStudioFlowBootstrapRecordOutputContract(policyAction).example).toHaveProperty("recordsPath");
  });

  it("lists exactly the keys the parser accepts, and requires exactly the ones it requires", () => {
    const contract = automationStudioFlowBootstrapRecordOutputContract(policyAction);
    const full: JsonObject = { ...contract.example, label: "Items", maxRecords: 10, recordsPath: "result.records" };

    expect(Object.keys(full).sort()).toEqual([...contract.keys].sort());
    expect(parseAutomationStudioRecordOutput(full)).toMatchObject({ ok: true });
    expect(parseAutomationStudioRecordOutput({ ...full, fields: [] })).toMatchObject({ ok: false, issues: expect.arrayContaining(["record_output.unknown_key"]) });
    for (const key of contract.keys) {
      const without = { ...full };
      delete without[key];
      expect(parseAutomationStudioRecordOutput(without).ok, key).toBe(!contract.requiredKeys.includes(key));
    }
  });

  it("says where the node supplies the path, and requires it where none does", () => {
    expect(automationStudioFlowBootstrapSuppliedRecordsPath(extractList)).toBe("result.extracted");
    expect(automationStudioFlowBootstrapSuppliedRecordsPath(writeRecords)).toBe("records");
    expect(automationStudioFlowBootstrapSuppliedRecordsPath(policyAction)).toBeUndefined();
    expect(automationStudioFlowBootstrapRecordOutputContract(extractList).requiredKeys).toEqual(["datasetId", "schema", "writeMode"]);
    expect(automationStudioFlowBootstrapRecordOutputContract(policyAction).requiredKeys).toEqual(["datasetId", "schema", "writeMode", "recordsPath"]);
    expect(automationStudioFlowBootstrapRecordOutputContract(extractList).text).toContain("this node supplies it");
    expect(automationStudioFlowBootstrapRecordOutputContract(policyAction).text).toContain("recordsPath: required");
  });

  it("names every value type and write mode the parser takes, and never encryption, which it refuses", () => {
    const { text, condensedText } = automationStudioFlowBootstrapRecordOutputContract(extractList);

    for (const valueType of AUTOMATION_STUDIO_RECORD_VALUE_TYPES) expect(text).toContain(valueType);
    for (const writeMode of AUTOMATION_STUDIO_RECORD_WRITE_MODES) {
      expect(text).toContain(writeMode);
      expect(condensedText).toContain(writeMode);
    }
    expect(text).not.toContain("encrypt");
    for (const key of ["datasetId", "schema", "writeMode", "schemaVersion", "fields"]) expect(condensedText).toContain(key);
  });

  it("leaves room in the catalog's 600-character parameter text for the node's own words", () => {
    for (const definition of [extractList, policyAction, writeRecords]) {
      const contract = automationStudioFlowBootstrapRecordOutputContract(definition);
      expect(contract.text.length).toBeLessThanOrEqual(460);
      expect(contract.condensedText.length).toBeLessThanOrEqual(200);
      expect(Buffer.byteLength(JSON.stringify(contract.example), "utf8")).toBeLessThanOrEqual(200);
    }
  });
});

// A live Flow creation (`run-mu4yk4u1-60a1c3a4`) added a node that writes
// records, validation accepted its plan, and the node failed when it ran with
// `record_output.invalid`: validation read a missing or null record output as
// "save nothing" for every node, and this node refuses one. The rows below run
// Core's own nodes and hold validation's verdict to theirs, value by value.
describe("a record output plan validation accepts", () => {
  const valid: JsonObject = {
    datasetId: "listings",
    recordsPath: "result.extracted",
    writeMode: "replace",
    schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", required: true }] }
  };
  const withoutPath: JsonObject = { ...valid };
  delete withoutPath.recordsPath;
  const values: Array<[string, JsonValue | undefined]> = [
    ["left out", undefined],
    ["null", null],
    ["an empty object", {}],
    ["a string", "listings"],
    ["an array", [valid]],
    ["a whole one", valid],
    ["one without a path", withoutPath],
    ["one with an empty path", { ...valid, recordsPath: "" }],
    ["one with a key the parser does not take", { ...valid, fields: [] }],
    ["one with a write mode it does not know", { ...valid, writeMode: "sometimes" }],
    ["one asking to encrypt a field", { ...valid, schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", handling: "encrypt" }] } }]
  ];
  const runs = async (id: string, value: JsonValue | undefined): Promise<boolean> => {
    const node = builtinAutomationNodeDefinitions.find((candidate) => candidate.id === id)!;
    const parameters: Record<string, JsonValue> = {
      ...(id === "builtin.policy.action" ? { outputId: "demo.extract" } : {}),
      ...(value === undefined ? {} : { recordOutput: value })
    };
    const result = await node.execute!({ inputs: { records: [{ title: "One" }] }, parameters });
    return result.status !== "failed";
  };

  it.each(["builtin.data.write-records", "builtin.policy.action"])("is one that %s runs with, and one it refuses is refused", async (id) => {
    for (const [label, value] of values) {
      const accepted = automationStudioFlowBootstrapRecordOutputIssues(builtin(id), value).length === 0;
      // A left-out parameter reaches the node either absent or as its declared default.
      expect(accepted, `${id}: ${label}`).toBe(await runs(id, value));
      if (value === undefined) expect(accepted, `${id}: ${label}, as its default`).toBe(await runs(id, builtin(id).parameters.find((parameter) => parameter.id === "recordOutput")!.defaultValue));
    }
  });

  it("refuses a node that writes records left without one, with the code its run fails on", () => {
    expect(automationStudioFlowBootstrapRecordOutputIssues(writeRecords, undefined)).toEqual(["record_output.not_object"]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(writeRecords, null)).toEqual(["record_output.not_object"]);
  });

  it("accepts none on the nodes that read none as saving nothing, or as a dataset they derive", () => {
    for (const definition of [policyAction, extractList]) {
      expect(automationStudioFlowBootstrapRecordOutputIssues(definition, undefined)).toEqual([]);
      expect(automationStudioFlowBootstrapRecordOutputIssues(definition, null)).toEqual([]);
    }
  });

  it("reads the path as each node does: a declared one fills a gap, the writing node's replaces any", () => {
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractList, withoutPath)).toEqual([]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractList, { ...valid, recordsPath: "" })).toEqual(["record_output.invalid_records_path"]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(writeRecords, { ...valid, recordsPath: "" })).toEqual([]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(policyAction, withoutPath)).toEqual(["record_output.missing_records_path"]);
  });
});
