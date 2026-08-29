import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { AdaptationsView, adaptationChangedFields, reviewFlowAdaptation } from "./index";

describe("Adaptations large-project behavior", () => {
  it("renders the empty scope without requesting detail JSON", () => {
    const html = renderToStaticMarkup(createElement(AdaptationsView, { projectId: null, flow: null }));
    expect(html).toContain("Select a Flow to review adaptations.");
    expect(html).not.toContain("Show complete adaptation JSON");
  });

  it("bounds large change comparisons and preserves permission failures", async () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const before = Object.fromEntries(fixture.adaptations.map((item) => [item.adaptationId, item.status]));
    const after = Object.fromEntries(fixture.adaptations.map((item) => [item.adaptationId, "applied"]));
    expect(adaptationChangedFields(before, after)).toHaveLength(50);

    const api = { post: vi.fn().mockResolvedValue({ ok: false, error: "adaptation.review permission required" }) } as any;
    await expect(reviewFlowAdaptation(api, { adaptationId: fixture.adaptations[0]!.adaptationId })).resolves.toEqual({
      ok: false, error: "adaptation.review permission required"
    });
    expect(api.post).toHaveBeenCalledWith("review-flow-adaptation", expect.any(Object));
  });
});
