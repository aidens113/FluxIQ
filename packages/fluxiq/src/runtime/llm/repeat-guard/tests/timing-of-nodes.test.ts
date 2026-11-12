import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceTimingFree } from "../timing-free.ts";
import { automationStudioLlmEvidenceTimingOfNodes } from "../timing-of-nodes.ts";

// The loop reads timing from the nodes' own definitions (run-mwc6ut8u-52e3c1b3,
// where a refused press ran again with only `timeoutMs` changed).
const definitions: Record<string, { parameters: Array<{ id: string; timing?: true }> }> = {
  "web.click": { parameters: [{ id: "target" }, { id: "timeoutMs", timing: true }] },
  "web.type": { parameters: [{ id: "target" }, { id: "text" }] }
};
const timingOf = automationStudioLlmEvidenceTimingOfNodes((node) => definitions[node]);

describe("timing parameters from node definitions", () => {
  it("names the parameters a node declares as timing", () => {
    expect(timingOf?.("web.click")).toEqual(["timeoutMs"]);
  });

  it("names nothing for a node that declares none, or one unknown", () => {
    expect(timingOf?.("web.type")).toBeUndefined();
    expect(timingOf?.("web.unknown")).toBeUndefined();
  });

  it("gives no lookup without definitions, so every parameter stays in the key", () => {
    expect(automationStudioLlmEvidenceTimingOfNodes(undefined)).toBeUndefined();
  });

  it("makes two presses that differ only in their wait the same call", () => {
    const one = automationStudioLlmEvidenceTimingFree("core.run_node", { node: "web.click", parameters: { target: { handle: "t4" }, timeoutMs: 10000 } }, timingOf);
    const two = automationStudioLlmEvidenceTimingFree("core.run_node", { node: "web.click", parameters: { target: { handle: "t4" }, timeoutMs: 30000 } }, timingOf);
    expect(one.asks).toEqual(two.asks);
    expect(one.timing).not.toEqual(two.timing);
  });
});
