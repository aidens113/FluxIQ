import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeMetricsPanel } from "../RunDetailPanels";
import { runtimeStoryHeadline } from "../run-detail-model";

describe("authoritative run retention projections", () => {
  it.each([true, false, undefined])("uses summary %s over current/raw adaptation evidence", (durable) => {
    const detail = { summary: { status: "succeeded", ...(durable === undefined ? {} : { durableBehaviorChanged: durable }) }, adaptationIds: ["a"], metadata: { adaptiveMetrics: { durableBehaviorChanged: durable !== true } } };
    const html = renderToStaticMarkup(createElement(RuntimeMetricsPanel, { summary: detail.summary, metrics: detail.metadata.adaptiveMetrics, recoveryCount: 0, interventionCount: 0, adaptationCount: 1 }));
    expect(html).toContain(`<span>Durable</span><strong>${durable === true ? "yes" : durable === false ? "no" : "unknown"}</strong>`);
    expect(runtimeStoryHeadline(detail)).toContain(durable === true ? "kept a change" : durable === false ? "did not keep" : "not available");
  });
});
