import { describe, expect, it } from "vitest";
import { secretKeysSnapshotInput } from "../index.ts";

describe("secret keys snapshot input", () => {
  it("takes nothing", () => {
    expect(secretKeysSnapshotInput.parse({})).toEqual({});
    expect(secretKeysSnapshotInput.parse(undefined)).toEqual({});
    expect(Object.keys(secretKeysSnapshotInput.jsonSchema().properties as object)).toEqual([]);
  });
});
