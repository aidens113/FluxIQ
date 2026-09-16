import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS, builtinAutomationStudioHarnessOptions } from "../builtin.ts";
import type { AutomationStudioHarnessOptionHost } from "../host.ts";
import { automationStudioHarnessOptionIssues } from "../option.ts";

const SOURCE_DIR = fileURLToPath(new URL("../", import.meta.url));

// The words a web domain would bring with it. Core owning exploration means
// none of them belongs here, whatever else changes.
const WEB_CONCEPTS = [
  /selector/i, /xpath/i, /browser/i, /viewport/i, /iframe/i, /cookie/i, /html/i, /\bdom\b/i, /\btab\b/i, /\burl\b/i, /\bcss\b/i, /\bpage\b/i
];

function fullHost(): AutomationStudioHarnessOptionHost {
  return {
    describeFlowGraph: async () => ({ nodes: [] }),
    describeNode: async ({ nodeId }) => ({ nodeId }),
    listAvailableNodes: async () => ({ definitions: [] }),
    captureStateSnapshot: async () => ({ stateRef: "state.one" }),
    inspectStateDiff: async ({ beforeRef, afterRef }) => ({ beforeRef, afterRef }),
    listPriorAdaptations: async ({ limit, failureSignature }) => ({ limit, failureSignature: failureSignature ?? null })
  };
}

function call(optionId: string, value: Record<string, unknown>) {
  return { projectId: "project.one", flowId: "flow.one", callId: "call.1", optionId, value: value as never, maxEvidenceBytes: 1_000 };
}

/** Source with comments removed, so a sentence explaining that Core carries no
 * browser concept is not itself read as one. */
function codeWithoutComments(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("Automation Studio built-in harness options", () => {
  it("names no browser concept, in what it declares or in its own code", () => {
    const bundle = builtinAutomationStudioHarnessOptions(fullHost());
    const declared = JSON.stringify(bundle.options);
    for (const concept of WEB_CONCEPTS) expect(declared).not.toMatch(concept);

    const files = readdirSync(SOURCE_DIR).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const code = codeWithoutComments(`${SOURCE_DIR}${name}`);
      for (const concept of WEB_CONCEPTS) expect(`${name}: ${code}`).not.toMatch(concept);
    }
  });

  it("ships one option per bound host method and nothing for an unbound one", () => {
    const full = builtinAutomationStudioHarnessOptions(fullHost());
    expect(full.options.map((option) => option.toolId).sort()).toEqual(Object.values(AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS).slice().sort());

    const empty = builtinAutomationStudioHarnessOptions({});
    expect(empty.options).toEqual([]);
    expect(empty.implementations).toEqual({});

    const partial = builtinAutomationStudioHarnessOptions({ describeFlowGraph: async () => ({}) });
    expect(partial.options.map((option) => option.toolId)).toEqual([AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph]);
  });

  it("declares every option validly, unscoped, observing, and without claiming the initial observation", () => {
    const bundle = builtinAutomationStudioHarnessOptions(fullHost());
    for (const option of bundle.options) {
      expect({ toolId: option.toolId, issues: automationStudioHarnessOptionIssues(option) }).toEqual({ toolId: option.toolId, issues: [] });
      expect(option.availability).toEqual({ kind: "both" });
      expect(option.effect).toBe("observe");
      expect(option.safety?.sideEffect).toBe("observe");
      // The loop runs at most one initial observation; a Core option taking
      // that slot would take it from every domain.
      expect(option.initialObservation).toBeUndefined();
    }
    expect(bundle.options.find((option) => option.toolId === AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateSnapshot)?.requiredRuntimeCapabilities).toEqual(["state-snapshot"]);
    expect(bundle.options.find((option) => option.toolId === AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateDiff)?.requiredRuntimeCapabilities).toEqual(["state-diff"]);
  });

  it("reads through the host port and refuses a malformed call as recoverable feedback", async () => {
    const { implementations } = builtinAutomationStudioHarnessOptions(fullHost());
    const ids = AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS;

    await expect(implementations[ids.nodeDetail]!(call(ids.nodeDetail, { nodeId: "node.one" }))).resolves.toEqual({ nodeId: "node.one" });
    await expect(implementations[ids.stateDiff]!(call(ids.stateDiff, { beforeRef: "state.one", afterRef: "state.two" })))
      .resolves.toEqual({ beforeRef: "state.one", afterRef: "state.two" });
    await expect(implementations[ids.priorAdaptations]!(call(ids.priorAdaptations, {}))).resolves.toEqual({ limit: 5, failureSignature: null });
    await expect(implementations[ids.priorAdaptations]!(call(ids.priorAdaptations, { limit: 3, failureSignature: "sig.one" })))
      .resolves.toEqual({ limit: 3, failureSignature: "sig.one" });

    const rejected = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "harness_option.input_invalid" }, effectApplied: false, resultCode: "harness_option.input_invalid" };
    await expect(implementations[ids.nodeDetail]!(call(ids.nodeDetail, {}))).resolves.toEqual(rejected);
    await expect(implementations[ids.nodeDetail]!(call(ids.nodeDetail, { nodeId: "node one!" }))).resolves.toEqual(rejected);
    await expect(implementations[ids.flowGraph]!(call(ids.flowGraph, { extra: true }))).resolves.toEqual(rejected);
    await expect(implementations[ids.stateDiff]!(call(ids.stateDiff, { beforeRef: "state.one" }))).resolves.toEqual(rejected);
    await expect(implementations[ids.priorAdaptations]!(call(ids.priorAdaptations, { limit: 99 }))).resolves.toEqual(rejected);
  });
});
