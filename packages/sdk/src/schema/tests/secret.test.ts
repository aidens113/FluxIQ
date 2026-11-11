// `secret()`: a developer declares a FluxNode input Core withholds, in zod or raw JSON Schema; the
// mark survives refinement, and a secret anywhere but a FluxNode's inputs is refused where it is written.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineFluxNode } from "../../define/index.ts";
import { SdkError } from "../../errors/index.ts";
import { secret } from "../secret.ts";
import { typeSchemaFrom, type TypeSchemaInput } from "../type-schema-from.ts";
import { zodToJsonSchema } from "../zod-to-json-schema.ts";

const signIn = (inputs: TypeSchemaInput, outputs?: TypeSchemaInput) => {
  const declared = { name: "notes.sign-in", runtime: "web", goal: "Sign in as {user} with the password {password}.", start: "https://notes.example/", scope: { sites: ["notes.example"], acts: [] }, inputs };
  return outputs === undefined ? defineFluxNode(declared) : defineFluxNode({ ...declared, outputs });
};

describe("secret()", () => {
  it("is a string with the secret format, refined before or after, optional or not", () => {
    expect(zodToJsonSchema(secret())).toEqual({ type: "string", format: "secret" });
    expect(zodToJsonSchema(secret(z.string().min(8)).max(64))).toEqual({ type: "string", format: "secret", minLength: 8, maxLength: 64 });
    expect(zodToJsonSchema(z.object({ password: secret().optional() }))).toEqual({ type: "object", properties: { password: { type: "string", format: "secret" } } });
    expect(secret().parse("hunter2")).toBe("hunter2");
  });

  it("is refused beside another format or a regex", () => {
    expect(() => zodToJsonSchema(secret(z.string().email()))).toThrow(/secret cannot also be held to the "email" format/u);
    expect(() => zodToJsonSchema(secret(z.string().regex(/^a/u)))).toThrow(/cannot carry a regex/u);
  });

  it("declares a FluxNode's secret input, in zod or raw JSON Schema", () => {
    expect(signIn(z.object({ user: z.string(), password: secret() })).spec.inputs?.properties?.["password"]).toEqual({ type: "string", format: "secret" });
    expect(signIn({ type: "object", properties: { user: { type: "string" }, password: { type: "string", format: "secret" } } }).spec.inputs?.properties?.["password"]).toEqual({ type: "string", format: "secret" });
  });

  it("is refused on outputs, a nested field and anything that is not a FluxNode's inputs", () => {
    expect(() => signIn(z.object({ user: z.string(), password: secret() }), z.object({ token: secret() }))).toThrow(SdkError);
    expect(() => signIn(z.object({ user: z.string(), password: z.object({ value: secret() }) }))).toThrow(/allowed only on an input declared directly/u);
    expect(() => typeSchemaFrom(z.object({ password: secret() }), "inputs")).toThrow(/allowed only on an input declared directly/u);
    expect(typeSchemaFrom(z.object({ password: secret() }), "inputs", { fluxNodeInputs: true }).properties?.["password"]).toEqual({ type: "string", format: "secret" });
  });
});
