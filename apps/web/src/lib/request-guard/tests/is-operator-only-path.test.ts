import { describe, expect, it } from "vitest";
import { isOperatorOnlyPath } from "../is-operator-only-path";

describe("isOperatorOnlyPath", () => {
  it("matches the three unchecked endpoints only", () => {
    expect(isOperatorOnlyPath("/api/programs/deployment-sync/sync")).toBe(true);
    expect(isOperatorOnlyPath("/api/programs/deployment-sync/rollback/")).toBe(true);
    expect(isOperatorOnlyPath("/api/programs/database-manager/run-migration")).toBe(true);
    expect(isOperatorOnlyPath("/api/programs/deployment-sync/status")).toBe(false);
    expect(isOperatorOnlyPath("/welcome")).toBe(false);
  });
});
