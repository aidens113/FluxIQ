// One zod object read two ways: the parser a handler uses and the JSON Schema a model is shown.
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { programApiInput } from "../index.ts";

const input = programApiInput(z.object({
  projectId: z.string().min(1).describe("The project."),
  limit: z.number().int().min(1).max(50).optional()
}));

describe("programApiInput", () => {
  it("parses a valid payload and drops fields it does not declare", () => {
    expect(input.parse({ projectId: "p-1", limit: 5, authorizationPin: "1234" })).toEqual({ projectId: "p-1", limit: 5 });
  });

  it("reads a missing payload as an empty object", () => {
    expect(input.read(undefined)).toEqual({ ok: false, error: expect.stringContaining("projectId:") });
  });

  it("names each wrong field, and throws a TypeError from parse", () => {
    const result = input.read({ projectId: "", limit: 500 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("projectId:");
      expect(result.error).toContain("limit:");
    }
    expect(() => input.parse({ limit: 2 })).toThrow(TypeError);
  });

  it("describes the same shape as JSON Schema, frozen and computed once", () => {
    const schema = input.jsonSchema();
    expect(schema).toEqual({
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1, description: "The project." },
        limit: { type: "integer", minimum: 1, maximum: 50 }
      },
      required: ["projectId"]
    });
    expect(input.jsonSchema()).toBe(schema);
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema.properties)).toBe(true);
  });

  it("refuses a schema JSON Schema cannot express", () => {
    const dated = programApiInput(z.object({ at: z.date() }));
    expect(() => dated.jsonSchema()).toThrow();
  });
});
