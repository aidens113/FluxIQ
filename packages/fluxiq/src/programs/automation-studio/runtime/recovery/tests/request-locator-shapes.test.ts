import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import {
  automationStudioExploredEvidenceLabel,
  packAutomationStudioLlmContext,
  type AutomationStudioLlmHarnessInput
} from "../../llm/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { automationStudioLocatorShapedText } from "../locator-text.ts";

// Nothing a repair is sent may be a way to address an element. The domain's
// packets have obeyed that since they were written -- a control is an opaque
// handle, and the selector behind it never leaves the sanitizer -- but the
// failure record's own `expected` and `actual` are sentences, and the web
// domain's sentences named the recorded control's test id and the refused
// candidates' tags. A key-by-key rule cannot see that, so it travelled.
//
// This walks the whole request rather than the field that was caught, because
// the next one will arrive somewhere else. The strings are the real ones: what
// the campaign's own failure records said, verbatim.

const DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;

const RECORDED_EXPECTED = 'an element matching selector [data-testid="detach-target"], visual target 379,116 (refused main scoring -0.29),'
  + ' element fingerprint (refused button[data-testid="dead-link"] "Link that goes nowhere" scoring -0.29)';
const RECORDED_ACTUAL = "nothing matched; 3 control(s) of the same family are on the page; best scored -0.29";

describe("no request body carries a way to address an element", () => {
  it("carries none, on the diagnosis and on the patch", () => {
    for (const taskKind of ["runtime_diagnosis", "runtime_patch"] as const) {
      const packed = packAutomationStudioLlmContext(harnessInput(taskKind));
      const offenders = locatorShapedStrings(packed as unknown as JsonValue);
      expect(offenders, `${taskKind}: ${offenders.join(" | ")}`).toEqual([]);
    }
  });

  it("keeps what the sentence was worth saying", () => {
    const packed = packAutomationStudioLlmContext(harnessInput("runtime_patch"));
    const failure = JSON.stringify((packed.recoveryContext?.sections.failure ?? {}) as JsonObject);
    // The scores, the counts and the visible name are the evidence for
    // refusing; only the locators are gone.
    expect(failure).toContain("refused main scoring -0.29");
    expect(failure).toContain("3 control(s) of the same family");
    expect(failure).toContain("Link that goes nowhere");
    expect(failure).not.toContain("detach-target");
    expect(failure).not.toContain("dead-link");
    expect(failure).not.toContain("data-testid");
  });

  it("fails when a locator reaches any slot, wherever it is put", () => {
    // The check is only worth having if it can see a locator anywhere, so each
    // slot is poisoned in turn and each must be found.
    const withFailureEvidence = packAutomationStudioLlmContext({
      ...harnessInput("runtime_patch"),
      failureEvidence: { schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", note: 'button[data-testid="pay"]' }] }
    });
    expect(locatorShapedStrings(withFailureEvidence as unknown as JsonValue)).not.toEqual([]);
    const withExploredPacket = packAutomationStudioLlmContext({
      ...harnessInput("runtime_patch"),
      explorationEvidence: {
        packets: [{ evidenceId: automationStudioExploredEvidenceLabel(1), toolId: "web.recovery.inspect", packet: { schemaVersion: "web-llm-evidence.v2", note: "//button[@id='pay']" } }],
        maxBytes: 4_000
      }
    });
    expect(locatorShapedStrings(withExploredPacket as unknown as JsonValue)).not.toEqual([]);
  });
});

/** Every string anywhere in the request that the locator screen would refuse. */
function locatorShapedStrings(value: JsonValue, found: string[] = []): string[] {
  if (typeof value === "string") {
    if (automationStudioLocatorShapedText(value)) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) locatorShapedStrings(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) locatorShapedStrings(item as JsonValue, found);
  }
  return found;
}

function harnessInput(taskKind: "runtime_diagnosis" | "runtime_patch"): AutomationStudioLlmHarnessInput {
  const detail = runDetail();
  return {
    taskKind,
    projectId: "project.1",
    flowId: "flow.1",
    runId: "run.1",
    nodeId: "node.checkout",
    instructions: [],
    runDetail: detail,
    deniedEvidenceKeys: DENIED_EVIDENCE_KEYS,
    failureEvidence: failurePacket(),
    recoveryContext: buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: traceAttempt(), byteBudget: 16_000 }),
    ...(taskKind === "runtime_patch"
      ? {
        diagnosis: { expected: "The recorded control ends the edit.", observed: "Nothing matched.", stillAchievable: "unknown" as const },
        explorationEvidence: {
          packets: [{ evidenceId: automationStudioExploredEvidenceLabel(1), toolId: "web.recovery.inspect", packet: exploredPacket() }],
          maxBytes: 4_000
        }
      }
      : {})
  };
}

/** The web domain's packet as it really arrives: handles, never locators. */
function failurePacket(): JsonObject {
  return {
    schemaVersion: "web-llm-evidence.v2",
    trust: "untrusted-page-evidence",
    title: "Failure surfaces",
    elements: [
      { target: "target.1", tag: "button", name: "Detach me", landmark: "main", heading: "Failure surfaces", disabled: true },
      { target: "target.4", tag: "p", text: "This item was deleted. Nothing here replaces it.", landmark: "main" }
    ],
    failedTargetUnknown: true,
    repairParameters: { element: "the control the action addresses" },
    truncated: true
  };
}

function exploredPacket(): JsonObject {
  return {
    schemaVersion: "web-llm-evidence.v2",
    title: "Product catalog",
    elements: [
      { target: "target.1", tag: "a", name: "Ember Scented Candle", item: { index: 1, total: 8 } },
      { target: "target.2", tag: "span", text: "$189.00", item: { index: 1, total: 8 } },
      { target: "target.3", tag: "span", text: "4.3 out of 5", item: { index: 1, total: 8 } }
    ]
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { runId: "run.1", flowId: "flow.1", projectId: "project.1", status: "failed", startedAt: 1, updatedAt: 9 } as AutomationStudioFlowRunDetail["summary"],
    routeDecisions: [],
    subflows: [],
    actionAttempts: [{
      attemptId: "attempt.2",
      nodeId: "node.checkout",
      definitionId: "web.output.dom-click",
      order: 2,
      status: "failed",
      route: "failed",
      startedAt: 3,
      finishedAt: 4,
      comparisonStatus: "target_not_found",
      message: "Could not click the Detach me button.",
      failure: { category: "target_not_found", code: "web.target.selector_miss", retryable: false, stage: "target_resolution", expected: RECORDED_EXPECTED, actual: RECORDED_ACTUAL },
      metadata: {
        targetResolution: { status: "unresolved_no_candidates", candidateCount: 0, failedSignals: ["testId"] }
      }
    }],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}

function traceAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "attempt.2",
    nodeId: "node.checkout",
    definitionId: "web.output.dom-click",
    startedAt: 3,
    finishedAt: 4,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    recoveryDecision: {
      lookup: { nodeId: "node.checkout", definitionId: "web.output.dom-click", attemptId: "attempt.2", comparisonStatus: "target_not_found" },
      // A domain writes these, so they are screened like everything else.
      candidates: [{ kind: "reroute", priority: 1, label: 'Retry through [data-route="guest"]', reason: "A guest route exists from this node." }]
    }
  };
}
