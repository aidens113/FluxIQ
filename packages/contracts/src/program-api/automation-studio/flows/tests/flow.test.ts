// The Flow list and create inputs: each accepts the request its handler reads today, and says so as JSON Schema.
import { describe, expect, it } from "vitest";
import { createFlowInput, getFlowInput, getFlowMetadataDetailInput, listFlowsInput, updateFlowSettingsInput } from "../index.ts";

describe("list-flows input", () => {
  it("accepts a project id and refuses a missing one", () => {
    expect(listFlowsInput.parse({ projectId: " p-1 " })).toEqual({ projectId: "p-1" });
    expect(listFlowsInput.read({}).ok).toBe(false);
  });

  it("requires projectId in its JSON Schema", () => {
    const schema = listFlowsInput.jsonSchema();
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["projectId"]);
  });
});

describe("create-flow input", () => {
  it("accepts the panel's request and the optional fields", () => {
    expect(createFlowInput.parse({ projectId: "p-1" })).toEqual({ projectId: "p-1" });
    expect(createFlowInput.parse({ projectId: "p-1", name: "Weekly report", description: "Collects numbers.", flowId: "flow-7", authSessionId: "s" }))
      .toEqual({ projectId: "p-1", name: "Weekly report", description: "Collects numbers.", flowId: "flow-7" });
  });

  it("refuses an empty name", () => {
    const result = createFlowInput.read({ projectId: "p-1", name: "  " });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("name:") });
  });

  it("describes every field a model may fill, with only projectId required", () => {
    const schema = createFlowInput.jsonSchema();
    expect(Object.keys(schema.properties as object).sort()).toEqual(["description", "flowId", "name", "projectId"]);
    expect(schema.required).toEqual(["projectId"]);
    expect((schema.properties as Record<string, { description?: string }>).name?.description).toBeTruthy();
  });
});

describe("get-flow, flow details and settings inputs", () => {
  it("need a project and a Flow", () => {
    expect(getFlowInput.parse({ projectId: "p-1", flowId: "f-1" })).toEqual({ projectId: "p-1", flowId: "f-1" });
    expect(getFlowMetadataDetailInput.read({ projectId: "p-1" }).ok).toBe(false);
  });

  it("update-flow-settings takes a name, description or visibility and refuses an unknown visibility", () => {
    expect(updateFlowSettingsInput.parse({ projectId: "p-1", flowId: "f-1", flow: { name: "Weekly" } }).flow).toEqual({ name: "Weekly" });
    const refused = updateFlowSettingsInput.read({ projectId: "p-1", flowId: "f-1", flow: { visibility: "secret" } });
    expect(refused).toEqual({ ok: false, error: expect.stringContaining("flow.visibility") });
  });
});
