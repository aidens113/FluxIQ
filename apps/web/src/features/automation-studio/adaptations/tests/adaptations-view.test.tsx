import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { AdaptationsView, AdaptationsViewContent, adaptationChangedFields, adaptationObjectTarget, adaptationReviewActions, adaptationReviewCopy } from "../index";
import { RuntimePostRunSummary } from "../../runtime";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

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
    expect(html).toContain('class="automation-adaptation-table" role="table"');
    expect(html).toContain('class="automation-runtime-empty" role="row"');
    expect(html).toContain('aria-colspan="4" role="cell"');
    expect(html).not.toContain("Training Status");
    const source = AdaptationsViewContent.toString();
    expect(source).toContain("aria-selected");
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

  it("keeps a requested adaptation detail load alive while inbox filters refresh", async () => {
    const detail = deferred<any>();
    const commands = {
      listAdaptations: vi.fn(async () => ({ ok: true, payload: { adaptations: [], page: { adaptations: [], limit: 25, offset: 0, total: 0 } } })),
      loadAdaptation: vi.fn(() => detail.promise),
      reviewAdaptation: vi.fn()
    } as any;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AdaptationsViewContent commands={commands} flow={{ flowId: "flow.one" }} projectId="project.one" requestedAdaptationId="adaptation.one" />);
    });
    expect(commands.loadAdaptation).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Filter by status" }).props.onChange({ target: { value: "proposed" } });
    });
    detail.resolve({ ok: true, payload: { adaptation: { adaptationId: "adaptation.one", status: "proposed", patch: [], validationResults: [] } } });
    await act(async () => { await detail.promise; });

    expect(renderer.root.findAll((node) => node.type === "span" && node.children.includes("adaptation.one"))).not.toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === "span" && node.children.includes("Loading..."))).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it("says in the summary whether a runtime patch was applied to the Flow, and why a held-back one was not", async () => {
    const decision = { autoApply: true, applyAt: "judged_whole_run", reason: "Low-risk patch with a passing trial." };
    const adaptations: Record<string, any> = {
      "adaptation.applied": { adaptationId: "adaptation.applied", status: "applied", patch: [], validationResults: [], metadata: { approvalDecision: { ...decision, applied: true } } },
      "adaptation.held": { adaptationId: "adaptation.held", status: "validated", patch: [], validationResults: [], metadata: { approvalDecision: { ...decision, applied: false, notAppliedReason: "run_parked" } } }
    };
    const text = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : text(child)).join(" ");
    for (const [adaptationId, expected, decisionHeading] of [
      ["adaptation.applied", ["Applied to the Flow", "its result was judged to answer the request."], "Allowed automatically and applied"],
      ["adaptation.held", ["Not applied to the Flow", "stopped to wait for a person, so its result was never judged."], "Allowed automatically, but held back"]
    ] as const) {
      const commands = {
        listAdaptations: vi.fn(async () => ({ ok: true, payload: { adaptations: [], page: { adaptations: [], limit: 25, offset: 0, total: 0 } } })),
        loadAdaptation: vi.fn(async () => ({ ok: true, payload: { adaptation: adaptations[adaptationId] } })),
        reviewAdaptation: vi.fn()
      } as any;
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<AdaptationsViewContent commands={commands} flow={{ flowId: "flow.one" }} projectId="project.one" requestedAdaptationId={adaptationId} />);
      });
      const rendered = text(renderer.root.findByProps({ "aria-label": "Whether this change is in the Flow" }));
      for (const phrase of expected) expect(rendered).toContain(phrase);
      expect(rendered).not.toContain("run_parked");
      // "Current Decision" agrees with "In The Flow": never "Automatically allowed" for a patch that was held back.
      const currentDecision = text(renderer.root.findAll((node) => node.type === "section" && text(node).includes("Current Decision")).at(-1));
      expect(currentDecision).toContain(decisionHeading);
      expect(currentDecision).not.toContain("Automatically allowed");
      // The reason sentence is said once on the Summary tab, in "In The Flow", and not repeated under "Current Decision".
      expect(currentDecision).not.toContain(expected[1]);
      const summary = text(renderer.root.findAll((node) => node.props.className === "automation-adaptation-detail-body")[0]);
      expect(summary.split(expected[1]).length - 1).toBe(1);
      await act(async () => renderer.unmount());
    }
  });

  it("marks each inbox row with whether its patch went into the Flow", async () => {
    const rows = [
      { adaptationId: "adaptation.applied", trigger: "Applied patch", status: "applied", riskLevel: "low", updatedAt: 3, judgedApplication: { applied: true } },
      { adaptationId: "adaptation.held", trigger: "Held patch", status: "validated", riskLevel: "low", updatedAt: 2, judgedApplication: { applied: false, notAppliedReason: "refuted" } },
      { adaptationId: "adaptation.waiting", trigger: "Waiting patch", status: "validated", riskLevel: "low", updatedAt: 1, judgedApplication: { applied: false } },
      { adaptationId: "adaptation.manual", trigger: "Manual patch", status: "proposed", riskLevel: "low", updatedAt: 0 }
    ];
    const commands = {
      listAdaptations: vi.fn(async () => ({ ok: true, payload: { adaptations: rows, page: { adaptations: rows, limit: 25, offset: 0, total: rows.length } } })),
      loadAdaptation: vi.fn(async () => ({ ok: false })),
      reviewAdaptation: vi.fn()
    } as any;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AdaptationsViewContent commands={commands} flow={{ flowId: "flow.one" }} projectId="project.one" />);
    });
    const text = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : text(child)).join(" ");
    const row = (trigger: string) => text(renderer.root.findAll((node) => node.type === "button" && node.props.role === "row" && text(node).includes(trigger))[0]);
    expect(row("Applied patch")).toContain("Applied to the Flow");
    expect(row("Held patch")).toContain("Not applied: result judged wrong");
    expect(row("Waiting patch")).toContain("Waiting for a judged run");
    expect(row("Manual patch")).not.toMatch(/Applied to the Flow|Not applied|Waiting for a judged run/);
    await act(async () => renderer.unmount());
  });
});
