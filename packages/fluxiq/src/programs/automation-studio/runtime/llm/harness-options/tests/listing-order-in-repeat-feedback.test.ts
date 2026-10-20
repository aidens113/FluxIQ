// A listing that sorts or limits its rows only in `recordOutput.process` while
// a repeat over it makes a lasting act is refused when the Flow is completed or
// submitted, at the listing's own line, with Core's reason (t741).
//
// Rerun round 3 (`run-mvgobp8h-b99ede98`, steps 0249-0284): the builder found
// the right rows by date but sorted them only in `recordOutput.process`, and
// `repeat over` with `repeat most: 3` acted on the listing's first three rows
// in page order. The domain orders the rows a read answers through
// `extractList.sort`; the process sort only shapes the saved answer.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);

const LISTING = JSON.stringify({ item: ".invoice", fields: { number: ".number", due: ".due" } });

/** An invoice list whose two oldest unpaid invoices are marked reviewed; the listing on lines 5-9. */
function reviewOldest(order: string[], consequences = "modify_existing"): string {
  return [
    "flow: Mark the two oldest unpaid invoices as reviewed",
    "step: open the unpaid invoices",
    "  node: web.browser.navigate",
    "  url: https://billing.test/invoices?status=unpaid",
    "step invoices: list the unpaid invoices",
    "  node: web.dom.extract_list",
    `  extractList: ${LISTING}`,
    "  extractList.minItems: 0",
    ...order,
    "step: mark the invoice as reviewed",
    "  node: web.dom.click",
    "  selector: .review",
    `  consequences: ${consequences}`,
    "  repeat over: invoices",
    "  repeat most: 2"
  ].join("\n");
}

const PROCESS_SORT = "  recordOutput.process: {\"sort\": [{\"field\": \"due\", \"order\": \"asc\", \"as\": \"date\"}], \"limit\": 2}";
const LISTING_SORT = "  extractList.sort: [{\"field\": \"due\", \"order\": \"asc\", \"as\": \"date\"}]";

async function check(flow: string) {
  return checkAutomationStudioFlowBootstrapCompletion({
    result: { summary: "invoices", flow }, projectId: "project.1", flowId: "flow.1", registry, resolution,
    // A domain that permits what is declared: what is refused here is only the order the repeat visits.
    binding: { resolvePlanNodeParameters: async () => ({ status: "unchanged" }) },
    permissionFor: () => async () => ({ permitted: true })
  });
}

describe("a process sort or limit on a listing a lasting repeat walks", () => {
  it("is refused at the listing step, saying the repeat visits the listing's own order and where the order goes", async () => {
    const verdict = await check(reviewOldest([PROCESS_SORT]));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(verdict.check.issueCodes).toEqual(["record_output.process_order_in_repeat"]);
    const issues = (verdict.check.feedback as JsonObject).issues as JsonObject[];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "record_output.process_order_in_repeat", label: "invoices", line: 5 });
    expect(issues[0]!.message).toContain("A repeat visits the rows in the listing's own order");
    expect(issues[0]!.instead).toContain("`extractList.sort:");
  });

  it("accepts the same order written on the listing itself", async () => {
    const verdict = await check(reviewOldest([LISTING_SORT]));
    expect(verdict.ok ? [] : verdict.check.issueCodes).toEqual([]);
  });

  it("accepts a process sort when the repeat makes no lasting act", async () => {
    const verdict = await check(reviewOldest([PROCESS_SORT], "none"));
    expect(verdict.ok ? [] : verdict.check.issueCodes).toEqual([]);
  });
});
