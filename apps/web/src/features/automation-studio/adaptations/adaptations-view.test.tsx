import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { AdaptationsView, AdaptationsViewContent, adaptationChangedFields, adaptationObjectTarget, adaptationReviewActions, adaptationReviewCopy } from "./index";
import { RuntimePostRunSummary } from "../runtime";

describe("Automation Adaptations workspace", () => {
  it("keeps runtime adaptation navigation inside typed workspace commands", () => {
    const source = RuntimePostRunSummary.toString();
    expect(source).toContain("onOpenAdaptation");
    expect(source).not.toContain("href=");
    expect(source).not.toContain("?view=");
  });
  it("builds friendly field diffs and routes adaptation targets to their owning editors", () => {
    expect(adaptationChangedFields(
      { timeoutMs: 100, target: { selector: "#old" }, enabled: true },
      { timeoutMs: 500, target: { selector: "#new" }, enabled: true, retryCount: 2 }
    )).toEqual([
      { path: "retryCount", before: "Not set", after: "2" },
      { path: "target.selector", before: "#old", after: "#new" },
      { path: "timeoutMs", before: "100", after: "500" }
    ]);
    expect(adaptationObjectTarget("edit_router", "route.1")).toEqual({ view: "router", label: "Open Router" });
    expect(adaptationObjectTarget("edit_subflow", "subflow.recovery")).toEqual({ view: "subflows", targetId: "subflow.recovery", label: "Open Subflows" });
    expect(adaptationObjectTarget("edit_instruction", "instruction.retry")).toEqual({ view: "instructions", targetId: "instruction.retry", label: "Open Instructions" });
    expect(adaptationObjectTarget("edit_action_target", "action.submit")).toEqual({ view: "nodes", targetId: "action.submit", label: "Open Node" });
  });

  it("renders the adaptive post-run story with durable change and adaptation link", () => {
    const html = renderToStaticMarkup(createElement(RuntimePostRunSummary, {
      result: {
        runtimeSession: { runId: "run.adaptive.1", flowId: "flow.checkout", status: "succeeded" },
        runSummary: { flowId: "flow.checkout", actionAttemptCount: 4, metadata: { recoveryAttemptCount: 1 } },
        interventionCount: 2,
        createdAdaptationIds: ["adaptation.retry"],
        durableBehaviorChanged: true,
        terminalReason: "Adaptive retry succeeded."
      }
    }));

    expect(html).toContain("Last Run");
    expect(html).toContain("Durable");
    expect(html).toContain("yes");
    expect(html).toContain("Adaptive retry succeeded.");
    expect(html).toContain("adaptation.retry");
    expect(html).toContain('type="button"');
    expect(html).not.toContain("href=");
  });

  it("renders the adaptations inbox tabs as a separate inner view", () => {
    const html = renderToStaticMarkup(
      createElement(AdaptationsView, {
        projectId: null,
        flow: null
      })
    );

    expect(html).toContain("Adaptation Inbox");
    expect(html).toContain("Search trigger or ID");
    expect(html).toContain("All statuses");
    expect(html).toContain("All risks");
    expect(html).toContain("Last updated");
    expect(html).toContain("Page 0 of 0");
    expect(html).toContain("Select a Flow to review adaptations.");
    expect(html).not.toContain("Training Status");
    const source = AdaptationsViewContent.toString();
    expect(source).toContain('"summary", "Summary"');
    expect(source).toContain('"changes", "Changes"');
    expect(source).toContain('"evidence", "Evidence"');
    expect(source).toContain('"validation", "Validation"');
    expect(source).toContain('"audit", "Audit"');
    expect(source.indexOf("Show complete adaptation JSON")).toBeGreaterThan(source.indexOf('detailView === "audit"'));
    expect(source).toContain("No source references were recorded.");
    expect(source).toContain("This adaptation has not been validated yet.");
    expect(source).toContain("ADAPTATION_DETAIL_PAGE_SIZE");
    expect(source).toContain("phase9.artifacts");
    expect(source).toContain("Lifecycle Events");
    expect(source).toContain("automation-adaptation-detail-pagination");
  });
  it("offers only valid adaptation lifecycle actions through an in-product authorization flow", () => {
    expect(adaptationReviewActions("proposed")).toEqual(["approve", "reject", "request_validation", "switch_manual"]);
    expect(adaptationReviewActions("validated")).toEqual(["apply", "reject", "disable", "supersede", "request_validation", "switch_manual"]);
    expect(adaptationReviewActions("applied")).toEqual(["revert"]);
    for (const terminal of ["rejected", "disabled", "reverted", "superseded"]) expect(adaptationReviewActions(terminal)).toEqual([]);
    expect(adaptationReviewCopy("supersede")).toMatchObject({ label: "Supersede", danger: true });
    const source = AdaptationsViewContent.toString();
    expect(source).toContain("pendingReviewAction");
    expect(source).toContain("Replacement adaptation ID");
    expect(source).toContain("Enter a reason for this decision.");
    expect(source).not.toContain("window.prompt");
  });
});
