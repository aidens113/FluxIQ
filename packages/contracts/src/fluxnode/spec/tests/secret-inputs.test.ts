// A secret input (`format: "secret"`): where a spec may declare one, what it may not hold beside it,
// that any text fits it, and which values of a run's inputs are its secrets.
import { describe, expect, it } from "vitest";
import { fluxNodeSecretInputs, parseFluxNodeInputs, parseFluxNodeSpec, parseJsonTypeSchema, validateJsonValue, type FluxNodeSpecInput } from "../../index.ts";

const LOGIN: FluxNodeSpecInput = {
  name: "notes.sign-in",
  runtime: "web",
  goal: "Sign in as {user} with the password {password} and list the notebooks.",
  start: "https://notes.example/",
  inputs: { type: "object", properties: { user: { type: "string" }, password: { type: "string", format: "secret", minLength: 1 } }, required: ["user", "password"] },
  scope: { sites: ["notes.example"], acts: [] }
};

function codes(result: { ok: true } | { ok: false; issues: { path: string; code: string }[] }): string[] {
  return result.ok ? [] : result.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("a secret input", () => {
  it("is declared on a string input directly under a FluxNode's inputs.properties", () => {
    const parsed = parseFluxNodeSpec(LOGIN);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.inputs?.properties?.["password"]).toEqual({ type: "string", format: "secret", minLength: 1 });
    expect(codes(parseFluxNodeInputs({ type: "object", properties: { apiKey: { type: ["string", "null"], format: "secret" } } }))).toEqual([]);
  });

  it("is refused on an output, a nested value, an alternative and a schema that is no FluxNode's inputs", () => {
    expect(codes(parseFluxNodeSpec({ ...LOGIN, outputs: { type: "object", properties: { token: { type: "string", format: "secret" } } } }))).toEqual(["/outputs/properties/token/format type_schema.secret_not_input"]);
    expect(codes(parseFluxNodeInputs({ type: "object", properties: { login: { type: "object", properties: { password: { type: "string", format: "secret" } } } } }))).toEqual(["/properties/login/properties/password/format type_schema.secret_not_input"]);
    expect(codes(parseFluxNodeInputs({ type: "object", properties: { password: { anyOf: [{ type: "string", format: "secret" }] } } }))).toEqual(["/properties/password/anyOf/0/format type_schema.secret_not_input"]);
    expect(codes(parseJsonTypeSchema({ type: "object", properties: { password: { type: "string", format: "secret" } } }))).toEqual(["/properties/password/format type_schema.secret_not_input"]);
  });

  it("holds no value in its declaration, needs a name a step can bind, and is a string", () => {
    const declared = (password: unknown, name = "password") => codes(parseFluxNodeInputs({ type: "object", properties: { [name]: password } }));
    expect(declared({ type: "string", format: "secret", default: "hunter2" })).toEqual(["/properties/password/default type_schema.secret_with_value"]);
    expect(declared({ type: "string", format: "secret", examples: ["hunter2"], enum: ["hunter2"] })).toEqual(["/properties/password/examples type_schema.secret_with_value", "/properties/password/enum type_schema.secret_with_value"]);
    expect(declared({ type: "string", format: "secret" }, "api_key")).toEqual(["/properties/api_key type_schema.secret_bad_name"]);
    expect(declared({ type: "string", format: "secret" }, "item")).toEqual(["/properties/item type_schema.secret_bad_name"]);
    expect(declared({ type: "number", format: "secret" })).toEqual(["/properties/password/format type_schema.keyword_type_mismatch"]);
  });

  it("fits any text", () => {
    expect(validateJsonValue({ type: "string", format: "secret" }, "c0rrect horse!")).toEqual([]);
    expect(validateJsonValue({ type: "string", format: "secret" }, 4)).toEqual([expect.objectContaining({ code: "type" })]);
  });

  it("names a run's secret values, and only text that was given", () => {
    const parsed = parseFluxNodeSpec(LOGIN);
    if (!parsed.ok) throw new Error("the example spec parses");
    expect(fluxNodeSecretInputs(parsed.value.inputs, { user: "ada", password: "hunter2" })).toEqual({ names: ["password"], values: { password: "hunter2" } });
    expect(fluxNodeSecretInputs(parsed.value.inputs, { user: "ada", password: "" })).toEqual({ names: ["password"], values: {} });
    expect(fluxNodeSecretInputs(undefined, { password: "hunter2" })).toEqual({ names: [], values: {} });
  });
});
