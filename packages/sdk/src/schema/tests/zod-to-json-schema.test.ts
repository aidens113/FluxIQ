import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "../zod-to-json-schema.ts";

describe("zodToJsonSchema", () => {
  it("converts the sample object of the plan", () => {
    const schema = z.object({ query: z.string(), country: z.string().length(2), count: z.number().int().max(10), tags: z.array(z.string()).max(5).optional() });
    expect(zodToJsonSchema(schema)).toEqual({
      type: "object",
      properties: {
        query: { type: "string" },
        country: { type: "string", minLength: 2, maxLength: 2 },
        count: { type: "integer", maximum: 10 },
        tags: { type: "array", items: { type: "string" }, maxItems: 5 }
      },
      required: ["query", "country", "count"]
    });
  });

  it("writes formats from zod's string checks", () => {
    expect(zodToJsonSchema(z.string().url())).toEqual({ type: "string", format: "uri" });
    expect(zodToJsonSchema(z.string().email())).toEqual({ type: "string", format: "email" });
    expect(zodToJsonSchema(z.string().datetime())).toEqual({ type: "string", format: "date-time" });
  });

  it("handles enums, literals, unions, nullable, defaults and records", () => {
    expect(zodToJsonSchema(z.enum(["a", "b"]))).toEqual({ type: "string", enum: ["a", "b"] });
    expect(zodToJsonSchema(z.literal(3))).toEqual({ const: 3 });
    expect(zodToJsonSchema(z.union([z.string(), z.number()]))).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
    expect(zodToJsonSchema(z.string().nullable())).toEqual({ type: ["string", "null"] });
    expect(zodToJsonSchema(z.enum(["a"]).nullable())).toEqual({ anyOf: [{ type: "string", enum: ["a"] }, { type: "null" }] });
    expect(zodToJsonSchema(z.object({ n: z.number().default(2) }))).toEqual({ type: "object", properties: { n: { type: "number", default: 2 } } });
    expect(zodToJsonSchema(z.record(z.number()))).toEqual({ type: "object", additionalProperties: { type: "number" } });
    expect(zodToJsonSchema(z.object({}).strict())).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });

  it("turns exclusive integer bounds into inclusive ones and refuses the rest", () => {
    expect(zodToJsonSchema(z.number().int().positive())).toEqual({ type: "integer", minimum: 1 });
    expect(() => zodToJsonSchema(z.number().positive())).toThrow(/exclusive bound/u);
  });

  it("refuses what has no JSON type, naming the path and what to write", () => {
    expect(() => zodToJsonSchema(z.object({ when: z.date() }))).toThrow(/type at \/properties\/when: a Date/u);
    expect(() => zodToJsonSchema(z.string().transform((value) => value.length))).toThrow(/transform/u);
    expect(() => zodToJsonSchema(z.tuple([z.string(), z.number()]))).toThrow(/tuple/u);
  });

  it("refuses a regex beside a format instead of dropping the developer's rule", () => {
    expect(() => zodToJsonSchema(z.string().email().regex(/@corp\.example$/u))).toThrow(/regex beside the "email" format/u);
  });

  it("sees through refinements", () => {
    expect(zodToJsonSchema(z.string().refine((value) => value.length > 1))).toEqual({ type: "string" });
  });
});
