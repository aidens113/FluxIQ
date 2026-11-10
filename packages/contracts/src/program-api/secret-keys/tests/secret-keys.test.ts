// The Secret Keys inputs: each accepts what its handler reads, refuses a wrong one plainly, and describes itself as JSON Schema.
import { describe, expect, it } from "vitest";
import { getAssistantModelInput, setAssistantModelInput, setDefaultKeyInput } from "../index.ts";

describe("set-default-key input", () => {
  it("accepts a key id and refuses a missing or empty one", () => {
    expect(setDefaultKeyInput.parse({ id: " secret:one " })).toEqual({ id: "secret:one" });
    expect(setDefaultKeyInput.read({}).ok).toBe(false);
    expect(setDefaultKeyInput.read({ id: "  " })).toEqual({ ok: false, error: expect.stringContaining("id:") });
  });

  it("requires only id, described, and never takes a key value", () => {
    const schema = setDefaultKeyInput.jsonSchema();
    expect(schema.required).toEqual(["id"]);
    expect(Object.keys(schema.properties as object)).toEqual(["id"]);
    expect((schema.properties as Record<string, { description?: string }>).id?.description).toBeTruthy();
  });
});

describe("assistant model inputs", () => {
  it("get takes nothing", () => {
    expect(getAssistantModelInput.parse({})).toEqual({});
    expect(getAssistantModelInput.parse(undefined)).toEqual({});
  });

  it("set accepts a key, a model, both or neither, and drops anything else", () => {
    expect(setAssistantModelInput.parse({})).toEqual({});
    expect(setAssistantModelInput.parse({ keyId: "secret:one", model: "a-model", value: "dropped" })).toEqual({ keyId: "secret:one", model: "a-model" });
  });

  it("set refuses an empty key or model", () => {
    expect(setAssistantModelInput.read({ keyId: " " })).toEqual({ ok: false, error: expect.stringContaining("keyId:") });
    expect(setAssistantModelInput.read({ model: "" })).toEqual({ ok: false, error: expect.stringContaining("model:") });
  });

  it("set describes both optional fields and requires neither", () => {
    const schema = setAssistantModelInput.jsonSchema();
    expect(Object.keys(schema.properties as object).sort()).toEqual(["keyId", "model"]);
    expect(schema.required).toBeUndefined();
    for (const field of Object.values(schema.properties as Record<string, { description?: string }>)) expect(field.description).toBeTruthy();
  });
});
