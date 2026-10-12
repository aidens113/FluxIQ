// What Core tells a model about naming an element never asks it for a
// selector, a locator, CSS or XPath (t432).
//
// The user's rule (2026-10-10): every saved element carries the full
// multi-signal fingerprint, and "the LLM model shouldnt have to worry about any
// of that, that's all handled by extension". The model names an element by the
// handle the page view printed and nothing else. This test reads every piece of
// Core's own guidance and refusal text a model is shown about elements -- the
// Flow script format, the library verb, the in-run repair instruction, the
// advice on a refused candidate, the refusal of a fact the model wrote, and the
// refusals of an `at` line -- and fails when any of them says one of those
// words, as an instruction or as a prohibition: a model told "never write a
// locator" has been taught that a locator is a thing it could write.
//
// The web domain's catalog text (its node labels, descriptions and parameter
// text) is held to the same words by the domain's own test.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT,
  type AutomationStudioFlowBootstrapPlan
} from "../../../flow-bootstrap/index.ts";
import { automationStudioCandidateSubmissionRefusal } from "../../../flow-bootstrap/candidate/index.ts";
import { readAutomationStudioFlowScriptFact } from "../../../flow-bootstrap/script-statements/index.ts";
import { AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION, automationStudioLlmRunNodeTool, resolveAutomationStudioFlowBootstrapPlanParameters } from "../../../llm/index.ts";

/** The words that name how a page finds an element, which a model is never asked for. */
const LOCATOR_WORDS = /\b(?:css|xpath|selectors?|locators?)\b/iu;

/** Every reason after `.handle.` a refused candidate is advised on (`flow-bootstrap/candidate/submission-refusal.ts`). */
const HANDLE_REASONS = ["unknown", "renumbered_by_reload", "stale", "not_unique", "ambiguous", "misplaced", "malformed", "frame_mismatch", "extraction_required", "not_a_control", "wrong_control", "unknown_field", "not_a_handle"];

function textOf(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

describe("Core's guidance and refusals about elements", () => {
  it("never name a selector, a locator, CSS or XPath in the Flow script format", () => {
    for (const text of [AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT]) {
      expect(textOf(text)).not.toMatch(LOCATOR_WORDS);
    }
  });

  it("never name one in the library verb, whose element is named by handle", () => {
    const tool = automationStudioLlmRunNodeTool({ nodeIds: ["demo.press"] });
    expect(tool?.description).toContain("{\"handle\":");
    expect(textOf(tool?.description)).not.toMatch(LOCATOR_WORDS);
    expect(textOf(tool?.inputSchema)).not.toMatch(LOCATOR_WORDS);
  });

  it("never name one in the in-run repair instruction, which says a fix names each control by handle", () => {
    const body = AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.body;
    expect(body).toContain("only by the handle the evidence printed for it");
    expect(body).not.toMatch(LOCATOR_WORDS);
  });

  it("never name one in the advice a refused candidate is given, for any handle reason", () => {
    for (const reason of HANDLE_REASONS) {
      const refused = automationStudioCandidateSubmissionRefusal({
        ok: false, revision: 1,
        check: { ok: false, issueCodes: [`demo.handle.${reason}`], feedback: { ok: false, code: "flow_bootstrap.completion_refused", issues: [{ code: `demo.handle.${reason}`, path: "plan.subflows.0.nodes.0.parameters", handles: [{ handle: "t5" }] }] } }
      } as Parameters<typeof automationStudioCandidateSubmissionRefusal>[0]);
      expect(String(refused.evidence.next), reason).not.toMatch(LOCATOR_WORDS);
    }
  });

  it("never name one when an `at` line is refused, and say to name the element by its handle", () => {
    for (const line of ["exists at", "exists at #sign-in", "exists at \"\""]) {
      const reading = readAutomationStudioFlowScriptFact(line);
      if (reading.ok) throw new Error(`${line} was read`);
      expect(reading.reason, line).not.toMatch(LOCATOR_WORDS);
      expect(reading.reason, line).toContain("by the handle the page view printed");
    }
  });

  it("never name one when a fact the model wrote names its element some other way", async () => {
    const plan: AutomationStudioFlowBootstrapPlan = {
      schemaVersion: "0.1",
      router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
      subflows: [{ key: "main", name: "Main", role: "primary", metadata: { "fluxiq.successCheck": [{ fact: "exists", op: "exists", target: { locator: "#done" } }] }, nodes: [], edges: [] }]
    };
    const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({ plan, projectId: "p", flowId: "f", binding: { resolvePlanNodeParameters: () => ({ status: "unchanged" }) }, handlesIssued: true, writtenByModel: true });
    if (resolved.ok) throw new Error("a locator fact the model wrote was accepted");
    for (const issue of resolved.issues) expect(issue.message).not.toMatch(LOCATOR_WORDS);
  });
});
