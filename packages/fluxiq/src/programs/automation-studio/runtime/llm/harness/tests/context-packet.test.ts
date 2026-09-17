import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import {
  packAutomationStudioLlmContext,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmHarnessInput,
  type AutomationStudioLlmProvider
} from "../index.ts";

// C-7b. An evidence-loop decision carries everything the loop has gathered so
// far, and during a recovery's exploration that is whatever the bound domain's
// options returned. It is held to the domain's declared keys like every other
// piece of evidence, and in the way failure evidence is: a request carrying a
// denied key is refused while it is being built, so nothing is sent at all.

const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;
const PRIVATE = "PRIVATE-RAW-PAYLOAD";

describe("packing an evidence-loop decision", () => {
  it("refuses a decision whose gathered evidence carries a key the bound domain denies, at any depth and in any spelling", () => {
    const values: JsonValue[] = [
      { schemaVersion: "web-llm-evidence.v2", html: PRIVATE },
      { schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", inner_html: PRIVATE }] },
      [{ frames: [{ OuterHTML: PRIVATE }] }],
      { page: { Selector: PRIVATE } },
      { request: { "page-source": PRIVATE } }
    ];
    for (const value of values) {
      const input = decision([clean(), { callId: "call.2", toolId: "web.recovery.inspect", value }]);
      expect(() => packAutomationStudioLlmContext(input), JSON.stringify(value)).toThrow(/denies/);
      try {
        packAutomationStudioLlmContext(input);
      } catch (error) {
        expect(String(error)).not.toContain(PRIVATE);
      }
    }
  });

  it("carries gathered evidence free of denied keys exactly, as a copy", () => {
    const input = decision([clean()]);
    const packed = packAutomationStudioLlmContext(input);
    expect(packed.evidenceLoop).toEqual(input.evidenceLoop);
    expect(packed.evidenceLoop).not.toBe(input.evidenceLoop);
    expect(packed.evidenceLoop?.evidence[0]).not.toBe(input.evidenceLoop?.evidence[0]);
    // A denied key is a key: the same word as a value is page text.
    const asText = decision([{ callId: "call.1", toolId: "web.recovery.inspect", value: { schemaVersion: "web-llm-evidence.v2", note: "the selector and the html of the cookies banner" } }]);
    expect(packAutomationStudioLlmContext(asText).evidenceLoop?.evidence).toHaveLength(1);
  });

  it("refuses gathered evidence the bound domain declared nothing about, and never reads the absence as an empty list", () => {
    const { deniedEvidenceKeys: _declared, ...undeclared } = decision([clean()]);
    expect(() => packAutomationStudioLlmContext(undeclared)).toThrow(/declared deniedEvidenceKeys/);
    // Nothing gathered yet is nothing carried, so the first decision of a loop
    // needs no declaration; the second one does.
    const { deniedEvidenceKeys: _none, ...first } = decision([]);
    expect(packAutomationStudioLlmContext(first).evidenceLoop?.evidence).toEqual([]);
    // A domain with nothing to deny says so, and its evidence is carried.
    expect(packAutomationStudioLlmContext({ ...decision([{ callId: "call.1", toolId: "t", value: { html: "declared as allowed" } }]), deniedEvidenceKeys: [] }).evidenceLoop?.evidence).toHaveLength(1);
  });

  it("never calls the provider with a refused decision", async () => {
    const asked: unknown[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "recording" },
      runTask: async (request) => {
        asked.push(request);
        return { response: { kind: "evidence_tool_decision", summary: "Done.", decision: { kind: "complete", result: {} } } };
      }
    };
    const refused = decision([clean(), { callId: "call.2", toolId: "web.recovery.inspect", value: { cookies: PRIVATE } }]);
    await expect(runAutomationStudioLlmHarness({ ...refused, provider })).rejects.toThrow(/denies/);
    expect(asked).toEqual([]);

    const allowed = await runAutomationStudioLlmHarness({ ...decision([clean()]), provider });
    expect(allowed.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(allowed.request.deniedEvidenceKeys).toEqual(WEB_DENIED_EVIDENCE_KEYS);
  });
});

function clean(): { callId: string; toolId: string; value: JsonValue } {
  return { callId: "call.1", toolId: "web.recovery.inspect", value: { schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", tag: "button", name: "Place order" }] } };
}

function decision(evidence: Array<{ callId: string; toolId: string; value: JsonValue }>): AutomationStudioLlmHarnessInput & { deniedEvidenceKeys: readonly string[] } {
  const tools = [{ toolId: "web.recovery.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
  const completionSchema = { type: "object" };
  return {
    taskKind: "evidence_tool_decision",
    projectId: "project.one",
    flowId: "flow.one",
    runId: "run.one",
    instructions: [],
    deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
    evidenceLoop: {
      iteration: evidence.length + 1,
      tools,
      evidence,
      decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true),
      completionSchema,
      canComplete: true
    }
  };
}
