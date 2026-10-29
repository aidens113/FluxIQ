import { describe, expect, it } from "vitest";
import { readBearerToken } from "../read-bearer-token";

describe("readBearerToken", () => {
  it("reads the token of a Bearer header, any case of the scheme", () => {
    expect(readBearerToken("Bearer abc.DEF-123_")).toBe("abc.DEF-123_");
    expect(readBearerToken("bearer   abc ")).toBe("abc");
  });

  it("answers null for an absent header or another form", () => {
    expect(readBearerToken(undefined)).toBeNull();
    expect(readBearerToken("")).toBeNull();
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readBearerToken("Bearer a b")).toBeNull();
  });
});
