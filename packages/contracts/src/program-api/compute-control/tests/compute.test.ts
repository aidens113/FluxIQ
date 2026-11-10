import { describe, expect, it } from "vitest";
import { computeControlSnapshotInput } from "../index.ts";

describe("compute control inputs", () => {
  it("snapshot takes nothing", () => {
    expect(computeControlSnapshotInput.parse({})).toEqual({});
    expect(computeControlSnapshotInput.parse(undefined)).toEqual({});
  });
});
