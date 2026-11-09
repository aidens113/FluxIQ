import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SdkError } from "../../errors/index.ts";
import { typeSchemaFrom } from "../type-schema-from.ts";

describe("typeSchemaFrom", () => {
  it("passes the plan's sample outputs through the contracts' parser", () => {
    const outputs = z.object({ listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })) });
    const schema = typeSchemaFrom(outputs, "outputs");
    expect(schema.properties?.listings?.items?.properties?.url).toEqual({ type: "string", format: "uri" });
  });

  it("accepts raw JSON Schema in the subset", () => {
    expect(typeSchemaFrom({ type: "object", properties: { n: { type: "integer", minimum: 1 } }, required: ["n"] }, "inputs").required).toEqual(["n"]);
  });

  it("drops a pattern beside a format in raw JSON Schema", () => {
    expect(typeSchemaFrom({ type: "string", format: "email", pattern: "^.+@.+$" }, "outputs")).toEqual({ type: "string", format: "email" });
  });

  it("explains a keyword the subset refuses, with the contracts' own message", () => {
    const attempt = (): unknown => typeSchemaFrom({ type: "string", format: "uuid" }, "outputs");
    expect(attempt).toThrow(SdkError);
    expect(attempt).toThrow(/outputs type is not one the engine can check/u);
  });

  it("refuses a bare pattern from zod", () => {
    expect(() => typeSchemaFrom(z.object({ sku: z.string().regex(/^[A-Z]{3}$/u) }), "outputs")).toThrow(/bare "pattern"/u);
  });
});
