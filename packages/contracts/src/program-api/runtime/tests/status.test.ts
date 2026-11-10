import { describe, expect, it } from "vitest";
import { getRuntimeRunInput, listRuntimeCapabilitiesInput, listRuntimeClientsInput, listRuntimeRunsInput, runtimeSnapshotInput } from "../index.ts";

describe("runtime inputs", () => {
  it("the listings take nothing", () => {
    for (const input of [runtimeSnapshotInput, listRuntimeClientsInput, listRuntimeCapabilitiesInput, listRuntimeRunsInput]) expect(input.parse(undefined)).toEqual({});
  });

  it("get-run needs a run id", () => {
    expect(getRuntimeRunInput.parse({ runId: "run-1" })).toEqual({ runId: "run-1" });
    expect(getRuntimeRunInput.read({ runId: " " })).toEqual({ ok: false, error: expect.stringContaining("runId:") });
  });
});
