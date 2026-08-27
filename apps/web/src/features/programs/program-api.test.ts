import { describe, expect, it } from "vitest";
import { classifyProgramApiEndpoint, estimateProgramApiPayloadBytes } from "./program-api";

describe("program API instrumentation helpers", () => {
  it("classifies summary, detail, mutation, and other endpoints", () => {
    expect(classifyProgramApiEndpoint("list-runtime-sessions", { summaries: true })).toBe("summary");
    expect(classifyProgramApiEndpoint("get-flow-run-detail")).toBe("detail");
    expect(classifyProgramApiEndpoint("save-flow")).toBe("mutation");
    expect(classifyProgramApiEndpoint("append-recording-note")).toBe("mutation");
    expect(classifyProgramApiEndpoint("normalize-recording")).toBe("mutation");
    expect(classifyProgramApiEndpoint("mine-recording-evidence")).toBe("mutation");
    expect(classifyProgramApiEndpoint("inspect-flow-dependencies")).toBe("other");
  });

  it("estimates serialized response size for development metrics", () => {
    expect(estimateProgramApiPayloadBytes({ ok: true, payload: { items: [1, 2, 3] } })).toBeGreaterThan(0);
  });
});
