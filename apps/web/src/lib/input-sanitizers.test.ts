import { describe, expect, it } from "vitest";
import { sanitizeAsciiDigits } from "./input-sanitizers";

describe("sanitizeAsciiDigits", () => {
  it("removes spaces, letters, punctuation, and non-ASCII digit glyphs", () => {
    expect(sanitizeAsciiDigits(" 1a2-3.4 ５٦", 6)).toBe("1234");
  });

  it("applies the maximum length after sanitizing", () => {
    expect(sanitizeAsciiDigits("12 34 56 78", 6)).toBe("123456");
  });
});
