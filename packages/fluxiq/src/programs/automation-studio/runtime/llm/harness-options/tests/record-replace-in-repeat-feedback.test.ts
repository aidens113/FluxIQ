// A read that saves its rows with `writeMode: replace` inside a loop is refused
// when the Flow is completed or submitted, with Core's reason (t498).
//
// Live run `run-mv6ff44s-01def7f6` rewrote its Flow from memory and brought
// back `writeMode: replace` on a read inside a `repeat while` paging span. The
// run dataset store clears the run's rows on every replace batch
// (`storage/project/run-dataset-store.ts`, `appendBatch`), so each page's pass
// deleted the passes before it, and the trial stored 0 of 17 kept rows.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const fixture = webDomainNodeDefinitionsFixture();
const click = fixture.find((definition) => definition.id === "web.output.dom-click")!;
// The web domain's next-page step, which answers `ended` when there is no further page.
const ENDED_OUTPUT: AutomationNodePort = { id: "ended", label: "Ended", valueType: "any", role: "branch" };
const nextPage: AutomationStudioNodeDefinition = {
  ...click,
  id: "web.output.dom-next_page",
  label: "Next Page",
  description: "Go to the list's next page, and answer ended when there is none.",
  source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
  outputAction: { fixedOutputId: "web.dom.next_page" },
  parameters: [{ id: "nextPage", label: "Next page", valueType: "object", example: { list: "extraction.1", control: "t9" }, ui: { control: "value" } }, { id: "timeoutMs", label: "Timeout", valueType: "number", defaultValue: 30_000 }],
  outputs: [...click.outputs, ENDED_OUTPUT]
};
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...fixture, nextPage]);

const LISTING = JSON.stringify({ item: ".recipe", fields: { title: ".title", minutes: ".minutes" } });
const NEXT = JSON.stringify({ item: ".recipe", pagination: { mode: "next", next: "a.older" } });

/** A recipe archive read page by page; the read on lines 5-10, its `recordOutput.writeMode` as given. */
function paging(writeMode: string | undefined): string {
  return [
    "flow: Every quick recipe in the archive",
    "step: open the archive",
    "  node: web.browser.navigate",
    "  url: https://recipes.test/archive",
    "step page: read this page of recipes",
    "  node: web.dom.extract_list",
    `  extractList: ${LISTING}`,
    "  extractList.minItems: 0",
    ...(writeMode ? [`  recordOutput.writeMode: ${writeMode}`] : []),
    "  repeat while: older",
    "step older: go to the older recipes",
    "  node: web.dom.next_page",
    `  nextPage: ${NEXT}`,
    "  consequences: none"
  ].join("\n");
}

async function check(flow: string) {
  return checkAutomationStudioFlowBootstrapCompletion({ result: { summary: "recipes", flow }, projectId: "project.1", flowId: "flow.1", registry, resolution });
}

describe("a record output that replaces its rows inside a loop", () => {
  it("is refused at the read, with why each pass loses the last and what to write instead", async () => {
    const verdict = await check(paging("replace"));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(verdict.check.issueCodes).toEqual(["record_output.replace_in_repeat"]);
    const issues = (verdict.check.feedback as JsonObject).issues as JsonObject[];
    expect(issues).toHaveLength(1);
    // Placed on the step the model wrote, by its own line.
    expect(issues[0]).toMatchObject({ code: "record_output.replace_in_repeat", label: "page", line: 5 });
    expect(issues[0]!.message).toContain("each pass would overwrite the rows the passes before it saved");
    expect(issues[0]!.message).toContain("writeMode: append");
  });

  it("accepts the same read appending, or with writeMode left out", async () => {
    expect((await check(paging("append"))).ok).toBe(true);
    expect((await check(paging(undefined))).ok).toBe(true);
  });

  it("accepts replace on a read that runs once, outside every loop", async () => {
    const once = [
      "flow: The newest recipes",
      "step: open the archive",
      "  node: web.browser.navigate",
      "  url: https://recipes.test/archive",
      "step page: read the first page of recipes",
      "  node: web.dom.extract_list",
      `  extractList: ${LISTING}`,
      "  extractList.minItems: 0",
      "  recordOutput.writeMode: replace"
    ].join("\n");
    expect((await check(once)).ok).toBe(true);
  });
});
