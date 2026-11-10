import { describe, expect, it } from "vitest";
import { deploymentSyncSnapshotInput } from "../index.ts";

describe("deployment sync inputs", () => {
  it("snapshot takes nothing", () => {
    expect(deploymentSyncSnapshotInput.parse({})).toEqual({});
    expect(deploymentSyncSnapshotInput.parse(undefined)).toEqual({});
  });
});
