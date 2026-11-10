import { describe, expect, it } from "vitest";
import { databaseManagerSnapshotInput } from "../index.ts";

describe("database manager inputs", () => {
  it("snapshot takes nothing", () => {
    expect(databaseManagerSnapshotInput.parse({})).toEqual({});
    expect(databaseManagerSnapshotInput.parse(undefined)).toEqual({});
  });
});
