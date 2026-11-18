import { describe, expect, it } from "vitest";
import { describePlan } from "../describe-plan";

describe("describePlan", () => {
  it("says what each line counts, in words", () => {
    expect(describePlan({ id: "browser", name: "Browser", lines: [{ unit: "dedicated-browser", quantity: 1 }] })).toBe("1 dedicated browser");
    expect(describePlan({ id: "team", name: "Team", lines: [{ unit: "dedicated-browser", quantity: 2 }, { unit: "seat", quantity: 5 }] })).toBe("2 dedicated browsers and 5 seats");
    expect(describePlan({ id: "shared", name: "Shared", lines: [{ unit: "flat", quantity: 1 }] })).toBe("the hosted service");
  });
});
