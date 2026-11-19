import { describe, expect, it } from "vitest";
import { allowanceWords } from "../allowance-words";
import { parseAllowance } from "../allowance-input";

describe("the allowance a person types", () => {
  it("reads dollars, with or without the sign", () => {
    expect(parseAllowance("0.75")).toEqual({ ok: true, usd: 0.75 });
    expect(parseAllowance(" $2 ")).toEqual({ ok: true, usd: 2 });
  });
  it("reads an empty box as the usual amount", () => {
    expect(parseAllowance("")).toEqual({ ok: true, usd: null });
  });
  it("refuses words, zero and negatives in plain words", () => {
    for (const text of ["abc", "0", "-1"]) expect(parseAllowance(text)).toEqual({ ok: false, message: "Type an amount in dollars, like 0.50." });
  });
  it("says an amount as dollars", () => {
    expect(allowanceWords(0.5)).toBe("$0.50");
  });
});
