import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeActionDetailPanel, RuntimeAttemptRow } from "../RunDetailPanels";

const routed = {
  attemptId: "attempt.3",
  nodeId: "add-to-cart",
  definitionId: "web.click",
  status: "succeeded",
  route: "state_routed",
  startedAt: 10,
  finishedAt: 20,
  inputs: {},
  outputs: {},
  effects: [],
  skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "checkout", direction: "forward" },
  stateRouting: { outcome: "routed", candidates: 3, matched: 1, toNodeId: "checkout", direction: "forward" },
  retry: { attemptNumber: 2, maxAttempts: 3, backoffMs: 1000, rung: "retry_node", previousAttemptId: "attempt.2" }
};
const panel = (attempt: any, view: any) => renderToStaticMarkup(createElement(RuntimeActionDetailPanel, { attempt, index: 2, view, onClose: () => undefined, onView: () => undefined }));

describe("attempt story in the run log", () => {
  it("shows a plain-words line for each runtime record under the attempt row, and the route in words", () => {
    const html = renderToStaticMarkup(createElement(RuntimeAttemptRow, { attempt: routed, index: 2, onSelect: () => undefined }));
    expect(html).toContain("automation-runtime-attempt-story");
    expect(html).toContain("Attempt 2 of 3: tried the step again after waiting 1 second");
    expect(html).toContain("Skipped “add-to-cart”: the page is already past it. Continuing with “checkout”.");
    expect(html).toContain(">Moved on<");
    expect(html).not.toContain(">state_routed<");
  });

  it("shows no story list for an attempt with no runtime records", () => {
    const html = renderToStaticMarkup(createElement(RuntimeAttemptRow, { attempt: { attemptId: "a", nodeId: "n", status: "succeeded", route: "success" }, index: 0 }));
    expect(html).not.toContain("automation-runtime-attempt-story");
    expect(html).toContain(">success<");
  });

  it("offers a What happened tab beside the others and lists the records in order there", () => {
    const html = panel(routed, "story");
    expect(html).toContain(">What happened</button>");
    expect(html).toContain("Raw JSON");
    const retried = html.indexOf("Attempt 2 of 3");
    const skipped = html.indexOf("Skipped “add-to-cart”");
    expect(retried).toBeGreaterThan(-1);
    expect(skipped).toBeGreaterThan(retried);
    expect(html).not.toContain("web.target.not_found");
  });

  it("says plainly when the run recorded nothing beyond running the step", () => {
    expect(panel({ attemptId: "a", nodeId: "n", status: "succeeded" }, "story")).toContain("The run recorded nothing beyond running this step");
  });

  it("keeps the codes in the Raw JSON tab", () => {
    const html = panel(routed, "raw");
    expect(html).toContain("web.target.not_found");
    expect(html).toContain("stateRouting");
    expect(html).toContain("retry_node");
  });
});
