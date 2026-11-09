// The zod bridge: zod issues become FluxNode issues, and a raw parser nests in zod.
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { finishRawParse, parseWithZod, zodFromParser } from "../index.ts";

describe("the zod bridge", () => {
  it("reports zod issues as pointers, keeping a custom code", () => {
    const schema = z
      .object({ a: z.array(z.string()) })
      .strict()
      .superRefine((_value, context) => context.addIssue({ code: z.ZodIssueCode.custom, path: ["a"], message: "no", params: { code: "x.custom" } }));
    expect(parseWithZod(schema, { a: [1], b: 2 })).toEqual({
      ok: false,
      issues: [
        { path: "/a/0", code: "invalid_type", message: "Expected string, received number" },
        { path: "", code: "unrecognized_keys", message: "Unrecognized key(s) in object: 'b'" }
      ]
    });
    expect(parseWithZod(schema, { a: [] })).toEqual({ ok: false, issues: [{ path: "/a", code: "x.custom", message: "no" }] });
  });

  it("never throws, even on a hostile value", () => {
    const hostile = {
      get a(): never {
        throw new Error("boom");
      }
    };
    const parsed = parseWithZod(z.object({ a: z.string() }), hostile);
    expect(parsed.ok).toBe(false);
  });

  it("nests a raw parser in zod with the outer path prefixed", () => {
    const inner = zodFromParser((value, issues) => {
      if (value === "ok") return "ok";
      issues.push({ path: ["deep"], code: "inner.bad", message: "bad" });
      return null;
    });
    const parsed = parseWithZod(z.object({ x: inner }), { x: "no" });
    expect(parsed).toEqual({ ok: false, issues: [{ path: "/x/deep", code: "inner.bad", message: "bad" }] });
    expect(finishRawParse(null, [])).toMatchObject({ ok: false, issues: [{ code: "invalid" }] });
  });
});
