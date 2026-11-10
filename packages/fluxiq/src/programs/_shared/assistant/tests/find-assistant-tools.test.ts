// Lexical tool search: words of the query against phrases, summary and endpoint name; no model.
import { describe, expect, it } from "vitest";
import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import { findAssistantTools } from "../index.ts";

function tool(endpoint: string, summary: string, phrases: string[] = []): AssistantToolEntry {
  return { name: `automation-studio__${endpoint}`, programId: "automation-studio", endpoint, summary, phrases, consequence: "read", contextArgs: {}, inputSchema: { type: "object" } };
}

const TOOLS = [
  tool("list-flows", "Lists the Flows in a project.", ["show my flows", "what flows do I have"]),
  tool("create-flow", "Creates a new, empty Flow in a project.", ["new flow", "make a flow"]),
  tool("delete-flow", "Deletes a Flow and its runs.", ["remove a flow"]),
  tool("list-runs", "Lists the runs of a Flow.", ["run history"])
];

describe("findAssistantTools", () => {
  it("ranks a tool whose phrase the query says above one that only shares a word", () => {
    expect(findAssistantTools(TOOLS, "please make a flow for me").map((item) => item.endpoint)[0]).toBe("create-flow");
    expect(findAssistantTools(TOOLS, "show my flows").map((item) => item.endpoint)[0]).toBe("list-flows");
  });

  it("matches plural and singular words alike", () => {
    expect(findAssistantTools(TOOLS, "runs").map((item) => item.endpoint)).toContain("list-runs");
    expect(findAssistantTools(TOOLS, "remove flows").map((item) => item.endpoint)[0]).toBe("delete-flow");
  });

  it("returns nothing for a query of stop words or no shared word", () => {
    expect(findAssistantTools(TOOLS, "the and of")).toEqual([]);
    expect(findAssistantTools(TOOLS, "weather tomorrow")).toEqual([]);
  });

  it("is deterministic, breaks ties by name and honours the limit", () => {
    const first = findAssistantTools(TOOLS, "flow", 2).map((item) => item.name);
    expect(first).toHaveLength(2);
    expect(findAssistantTools(TOOLS, "flow", 2).map((item) => item.name)).toEqual(first);
    expect(findAssistantTools(TOOLS, "flow", 0)).toEqual([]);
  });
});
