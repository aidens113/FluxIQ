import { describe, expect, it } from "vitest";
import { bodyRefusalCode } from "../body-refusal-code.ts";

const issue = (path: string) => ({ path, code: "invalid", message: "No." });

describe("bodyRefusalCode", () => {
  it("names the spec when every issue is inside it", () => {
    expect(bodyRefusalCode([issue("/spec/goal"), issue("/spec")])).toBe("invalid_spec");
  });
  it("names the request for issues outside the spec, mixed ones, and none", () => {
    expect(bodyRefusalCode([issue("")])).toBe("invalid_request");
    expect(bodyRefusalCode([issue("/spec/goal"), issue("/inputs")])).toBe("invalid_request");
    expect(bodyRefusalCode([issue("/specs")])).toBe("invalid_request");
    expect(bodyRefusalCode([])).toBe("invalid_request");
  });
});
