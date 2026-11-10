import { describe, expect, it } from "vitest";
import { productionRunnerSnapshotInput } from "../index.ts";

describe("production runner inputs", () => {
  it("snapshot takes nothing", () => {
    expect(productionRunnerSnapshotInput.parse({})).toEqual({});
    expect(productionRunnerSnapshotInput.parse(undefined)).toEqual({});
  });
});
