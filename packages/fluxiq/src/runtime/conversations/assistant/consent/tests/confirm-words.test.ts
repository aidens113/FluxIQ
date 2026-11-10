import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import { describe, expect, it } from "vitest";
import { panelAssistantConfirmWords } from "../confirm-words.ts";
import { panelAssistantGatedClasses } from "../gated-class.ts";

const DELETE_FLOW: AssistantToolEntry = { name: "automation-studio__delete-flow", programId: "automation-studio", endpoint: "delete-flow", summary: "Deletes a Flow.", phrases: [], consequence: "delete", contextArgs: {}, inputSchema: {} };

describe("panelAssistantConfirmWords", () => {
  it("asks the act about the named target, with what the lookup knows of its effect", () => {
    expect(panelAssistantConfirmWords({ tool: DELETE_FLOW, classes: ["delete"], target: { items: [{ kind: "Flow", id: "flow.old", name: "Old search" }], detail: "It removes the Flow and its 12 runs." } }))
      .toBe("Delete the Flow “Old search”? It removes the Flow and its 12 runs.");
  });

  it("says why it asks when nothing more is known, and keeps the summary's object without a target", () => {
    expect(panelAssistantConfirmWords({ tool: DELETE_FLOW, classes: ["delete"], target: undefined })).toBe("Delete a Flow? It cannot be undone.");
    expect(panelAssistantConfirmWords({ tool: { ...DELETE_FLOW, summary: "Publishes a Flow as a named version." }, classes: ["send", "budget"], target: { items: [{ kind: "Flow", id: "f" }] } }))
      .toBe("Publish this Flow? It may send or publish something other people will see. It may cost more than is left of this message's spending allowance.");
  });

  it("keeps the tool's own words for a target the call may act on more widely than its name says", () => {
    expect(panelAssistantConfirmWords({ tool: { ...DELETE_FLOW, summary: "Deletes a project and everything in it." }, classes: ["delete"], target: { items: [{ kind: "project", id: "p.1", name: "Shop" }], partial: true } }))
      .toBe("Delete a project and everything in it: the project “Shop”? It cannot be undone.");
  });
});

describe("panelAssistantGatedClasses", () => {
  it("gates send, money, delete and security, and budget only when over what is left", () => {
    expect(panelAssistantGatedClasses(["read"], false)).toEqual([]);
    expect(panelAssistantGatedClasses(["change"], true)).toEqual(["budget"]);
    expect(panelAssistantGatedClasses(["change", "send", "money", "delete"], false)).toEqual(["send", "money", "delete"]);
    expect(panelAssistantGatedClasses(["security"], false)).toEqual(["security"]);
  });
});
