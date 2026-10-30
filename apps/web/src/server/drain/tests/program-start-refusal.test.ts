import { afterEach, describe, expect, it } from "vitest";
import { drainState } from "../drain-state";
import { programDrainRefusal } from "../program-start-refusal";

afterEach(() => drainState.reset());

describe("programDrainRefusal", () => {
  it("refuses endpoints that start work while draining", () => {
    drainState.markDraining();
    for (const endpoint of ["start-runtime-session", "run-runtime-session", "append-turn", "execute-client-action"]) {
      const refusal = programDrainRefusal("automation-studio", endpoint);
      expect(refusal?.status).toBe(503);
      expect(refusal?.body.errorCode).toBe("server.draining");
      expect(refusal?.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("lets reads and stops through while draining", () => {
    drainState.markDraining();
    for (const endpoint of ["get-runtime-session", "list-runtime-sessions", "cancel-runtime-session", "pause-runtime-session", "stop-client-recording", "get-conversation"]) {
      expect(programDrainRefusal("automation-studio", endpoint)).toBeNull();
    }
  });

  it("refuses nothing when not draining", () => {
    expect(programDrainRefusal("automation-studio", "start-runtime-session")).toBeNull();
  });
});
