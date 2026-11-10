import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import { describe, expect, it } from "vitest";
import { panelAssistantInputWithContext } from "../context-args.ts";
import { panelAssistantContextLine } from "../context-line.ts";
import { panelAssistantContextOf } from "../panel-context.ts";

describe("panelAssistantContextOf", () => {
  it("reads the page and selection strictly, the selection winning over the older fields", () => {
    expect(panelAssistantContextOf({ page: "flows", flowId: "flow.old", selection: { projectId: "p.1", flowId: "flow.new", stepNumbers: [5, 0, 2.5, "3"], nodeIds: ["n.1", "bad id!"] } }))
      .toEqual({ page: "flows", projectId: "p.1", flowId: "flow.new", stepNumbers: [5], nodeIds: ["n.1"] });
    expect(panelAssistantContextOf({ runId: "run.1" })).toEqual({ runId: "run.1" });
    expect(panelAssistantContextOf(undefined)).toEqual({});
    expect(panelAssistantContextOf({ page: "<script>" })).toEqual({});
  });
});

describe("panelAssistantContextLine", () => {
  it("says where the person is in one line, with names and never ids", () => {
    expect(panelAssistantContextLine({ page: "flows", projectId: "p.1", flowId: "f.1", stepNumbers: [5] }, { project: "Shop", flow: "Cheapest listings" })).toBe("On Flows › “Cheapest listings”, step 5 selected.");
    expect(panelAssistantContextLine({ page: "runs", runId: "run.9" }, {})).toBe("On Runs, a run selected.");
    expect(panelAssistantContextLine({ page: "settings" }, {})).toBe("On Settings.");
    expect(panelAssistantContextLine({}, {})).toBe("The person has nothing open.");
  });
});

describe("panelAssistantInputWithContext", () => {
  const tool: AssistantToolEntry = { name: "s__rename-step", programId: "s", endpoint: "rename-step", summary: "Renames a step.", phrases: [], consequence: "change", contextArgs: { projectId: "projectId", flowId: "flowId", steps: "stepNumbers" }, inputSchema: {} };

  it("fills what the model left out from the page, and keeps what it wrote", () => {
    expect(panelAssistantInputWithContext(tool, { label: "Open the list", flowId: "f.model" }, { projectId: "p.1", flowId: "f.page", stepNumbers: [2] }))
      .toEqual({ label: "Open the list", projectId: "p.1", flowId: "f.model", steps: [2] });
  });
});
