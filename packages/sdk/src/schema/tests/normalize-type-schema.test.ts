import { describe, expect, it } from "vitest";
import { SdkError } from "../../errors/index.ts";
import { normalizeTypeSchema } from "../normalize-type-schema.ts";

describe("normalizeTypeSchema", () => {
  it("drops a pattern that sits beside a format, at any depth", () => {
    const emitted = { type: "object", properties: { url: { type: "string", format: "uri", pattern: "^https?://" }, list: { type: "array", items: { type: "string", format: "email", pattern: ".+@.+" } } } };
    expect(normalizeTypeSchema(emitted)).toEqual({ type: "object", properties: { url: { type: "string", format: "uri" }, list: { type: "array", items: { type: "string", format: "email" } } } });
  });

  it("does not change its input", () => {
    const emitted = { type: "string", format: "uri", pattern: "x" };
    normalizeTypeSchema(emitted);
    expect(emitted.pattern).toBe("x");
  });

  it("refuses a bare pattern with the path and a suggestion", () => {
    const attempt = (): unknown => normalizeTypeSchema({ type: "object", properties: { sku: { type: "string", pattern: "^[A-Z]{3}$" } } });
    expect(attempt).toThrow(SdkError);
    expect(attempt).toThrow(/type at \/properties\/sku: a bare "pattern" is not supported.*format/su);
  });
});
