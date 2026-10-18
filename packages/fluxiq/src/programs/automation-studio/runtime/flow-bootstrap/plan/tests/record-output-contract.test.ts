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
  automationStudioFlowBootstrapRecordOutputIssueDetail,
  automationStudioFlowBootstrapRecordOutputIssueMessage,
  automationStudioFlowBootstrapRecordOutputIssues,
  automationStudioFlowBootstrapSuppliedRecordsPath
} from "../record-output-contract.ts";
import { automationStudioFlowBootstrapParameterTextAccount } from "../parameter-text.ts";
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
  it("explains explicit computation ownership in both actual catalog forms", () => {
    const contract = automationStudioFlowBootstrapRecordOutputContract(extractList);
    for (const text of [contract.text, contract.condensedText]) {
      expect(text).toContain("purpose: answer|intermediate");
      expect(text).toContain("absent means answer");
      expect(text).toContain("never saves or clears");
      expect(text).toContain("Read conditions, coverage and actions remain evidence");
    }
  });
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
    const full: JsonObject = { ...contract.example, label: "Items", maxRecords: 10, recordsPath: "result.records", process: { dedupe: { by: ["name"] } }, purpose: "answer" };

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

  it("describes supported processing in full and condensed formats and delivers it without cuts", () => {
    for (const definition of [extractList, policyAction, writeRecords]) {
      const contract = automationStudioFlowBootstrapRecordOutputContract(definition);
      for (const text of [contract.text, contract.condensedText]) {
        for (const shape of ["process", "dedupe", "by", "where", "sort", "limit", "columns", "minRows", "asc", "desc"]) expect(text).toContain(shape);
      }
      const parameter = definition.parameters.find((entry) => entry.id === "recordOutput")!;
      const sent = automationStudioFlowBootstrapParameterTextAccount(definition, parameter);
      expect(sent.parameter.description).toContain(contract.text);
      expect(sent.withheld).toBe(false);
    }
  });

  it.each([
    { dedupe: { by: ["name"] } }, { dedupe: false },
    { where: [{ field: "name", contains: "memo" }] },
    { sort: [{ field: "name", order: "asc", as: "text" }] },
    { limit: 2 }, { columns: ["name"] }, { minRows: 0 }
  ])("accepts the advertised processing shape %j", (process) => {
    const contract = automationStudioFlowBootstrapRecordOutputContract(policyAction);
    expect(parseAutomationStudioRecordOutput({ ...contract.example, process })).toMatchObject({ ok: true });
  });

  it("keeps unknown processing keys refused while showing the supported dedupe shape", () => {
    const contract = automationStudioFlowBootstrapRecordOutputContract(policyAction);
    expect(parseAutomationStudioRecordOutput({ ...contract.example, process: { unique: ["name"] } })).toMatchObject({
      ok: false, issues: ["record_output.process_unknown_key"]
    });
    expect(contract.text).toContain("dedupe: false | {by:[fieldId,...]}");
    expect(contract.keys).toContain("process");
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

// Breadth wave 1 (`run-mv6qrbgx-06151cdb`, 0022-0026): a sort on a field the schema marked `handling: "exclude"`, so
// the answer would not show it, was refused with "Name a stored field id instead", and no stored field could order the
// rows. The model moved the sort from one excluded field to another until the build ended. t510 (F2): a sort or dedupe
// key that is refused says to keep it stored and hide it with process.columns, and the refusal carries `{field, valid}`.
describe("the sentence and detail a refused processing field is given", () => {
  const recordOutput = (process: JsonObject, fields: JsonValue[]): JsonObject => ({
    datasetId: "tasks",
    writeMode: "append",
    schema: { schemaVersion: "0.1", fields },
    process
  });
  const name = { id: "name", label: "Name", valueType: "string" };
  const owner = { id: "owner", label: "Owner", valueType: "string" };
  const due = { id: "due", label: "Due", valueType: "string", handling: "exclude" };

  it("tells a sort on an excluded field to keep it stored and hide it with process.columns", () => {
    const value = recordOutput({ sort: [{ field: "due", order: "asc" }], columns: ["name", "owner"] }, [name, owner, due]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractList, value)).toEqual(["record_output.process_excluded_field"]);
    const message = automationStudioFlowBootstrapRecordOutputIssueMessage("record_output.process_excluded_field", value)!;
    expect(message).toContain("\"due\"");
    expect(message).toContain("remove handling \"exclude\"");
    expect(message).toContain("process.columns");
    expect(message).not.toContain("Name a stored field id instead");
    expect(automationStudioFlowBootstrapRecordOutputIssueDetail("record_output.process_excluded_field", value)).toEqual({ field: "due", valid: ["name", "owner"] });
  });

  it("says the same for a dedupe key, and still says to name a stored id for a column alone", () => {
    const deduped = recordOutput({ dedupe: { by: ["due"] } }, [name, due]);
    expect(automationStudioFlowBootstrapRecordOutputIssueMessage("record_output.process_excluded_field", deduped)).toContain("process.columns");
    const listed = recordOutput({ columns: ["name", "due"] }, [name, due]);
    expect(automationStudioFlowBootstrapRecordOutputIssueMessage("record_output.process_excluded_field", listed)).toContain("Name a stored field id instead");
    expect(automationStudioFlowBootstrapRecordOutputIssueDetail("record_output.process_excluded_field", listed)).toEqual({ field: "due", valid: ["name"] });
  });

  it("tells a sort on a field the schema lacks to add it to schema.fields and hide it with process.columns", () => {
    const value = recordOutput({ sort: [{ field: "due", order: "asc" }] }, [name, owner]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractList, value)).toEqual(["record_output.process_unknown_field"]);
    const message = automationStudioFlowBootstrapRecordOutputIssueMessage("record_output.process_unknown_field", value)!;
    expect(message).toContain("\"due\"");
    expect(message).toContain("process.columns");
    expect(automationStudioFlowBootstrapRecordOutputIssueDetail("record_output.process_unknown_field", value)).toEqual({ field: "due", valid: ["name", "owner"] });
  });

  it("names a dropped where field and the columns kept, and gives no detail for other codes", () => {
    const value = recordOutput({ where: [{ field: "owner", is: "present" }], columns: ["name"] }, [name, owner]);
    expect(automationStudioFlowBootstrapRecordOutputIssueDetail("record_output.process_where_column_dropped", value)).toEqual({ field: "owner", valid: ["name"] });
    expect(automationStudioFlowBootstrapRecordOutputIssueDetail("record_output.invalid", value)).toBeUndefined();
  });
});

// t510 (F3): `exclude` was read as "left out of the answer"; the contract says it means never stored, and that
// process.columns is what leaves a stored field out of the answer.
describe("what handling exclude and process.columns mean, as the contract says them", () => {
  it("says exclude is never stored and that a sort or dedupe key may be a stored field columns leaves out", () => {
    const { text, condensedText } = automationStudioFlowBootstrapRecordOutputContract(extractList);
    expect(text).toContain("exclude: never stored");
    for (const shown of [text, condensedText]) expect(shown).toContain("a sort or dedupe key may be a stored field columns leaves out");
  });
});
