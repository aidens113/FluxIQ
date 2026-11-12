// Scope identity is deterministic and keeps raw request inputs out of persisted scope names.
import { describe, expect, it } from "vitest";
import { fluxNodeActScope } from "../index.ts";

describe("a FluxNode run's act scope", () => {
  it("is the run's own without a key, and the allocated opaque keyed execution whichever run carries it", () => {
    expect(fluxNodeActScope({ runId: "fnr-1" })).toBe("fluxnode.run.fnr-1");
    const keyScope = "fluxnode.key.opaque-allocation";
    expect(fluxNodeActScope({ runId: "fnr-1", keyScope })).toBe(keyScope);
    expect(fluxNodeActScope({ runId: "fnr-2", keyScope })).toBe(keyScope);
  });
});
