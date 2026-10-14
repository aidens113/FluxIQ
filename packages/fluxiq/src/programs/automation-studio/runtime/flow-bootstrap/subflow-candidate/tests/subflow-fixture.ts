// A brief's surroundings for the subflow builder tests: the web domain's real
// node definitions and the candidate refusal tests' stub domain
// (`../../candidate/tests/refusal-domain-fixture.ts`), a scope, and scripts.
import type { JsonObject } from "../../../../../../core/index.ts";
import { refusalTestSubmission } from "../../candidate/tests/refusal-domain-fixture.ts";
import type { AutomationStudioSubflowScope } from "../index.ts";

export const SIBLINGS = ["sign_in", "checkout"] as const;

export function testScope(overrides: Partial<AutomationStudioSubflowScope> = {}): AutomationStudioSubflowScope {
  return {
    buildId: "build.1", briefId: "brief-1", planDigest: "plan.digest.1", subflowKey: "find_listing",
    parts: [{ partId: "p1", sourceId: "instruction.1", text: "Find the listings on the listings page" }],
    predecessors: ["sign_in"],
    ...overrides
  };
}

export function testSubmission() {
  return refusalTestSubmission();
}

export const OPEN = ["flow: Find the listings", "step: open the listings", "  node: web.browser.navigate", "  url: https://listings.test/all"];

/** A part the target calls: one harmless press. */
export function part(label = "narrow"): string[] {
  return [`part ${label}: narrow the listing`, "  step: press the filter", "    node: web.dom.click", "    selector: .filter", "    consequences: none", "end"];
}

export function callPart(label = "narrow"): string[] {
  return [`step: run subflow ${label}`];
}

export function script(lines: readonly string[]): JsonObject {
  return { flow: lines.join("\n") };
}
