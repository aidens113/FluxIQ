// An unresolved handle that is a word a parameter takes is answered with the
// form that parameter takes it in (t514).
//
// The refusal that ended social gate run `run-mv6v2jh4-69244ffb` was a bare
// `bootstrap.handle_unresolved` at a node's parameters: no key, no form. Plan
// resolution now places it at the parameter holding the leftover handle and
// says so in Core's own words; the feedback adds the node to describe and,
// when the leftover token is a word one of the node's parameters takes, the
// line to write instead, read from the node's own schema.

import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapIssueFeedback } from "../index.ts";
import { waitNodeDefinitionFixture, WAIT_NODE_DEFINITION_ID } from "./index.ts";

const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, waitNodeDefinitionFixture()]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [] as string[], permissions: [] as string[] };

function planWith(expectedState: unknown) {
  return {
    schemaVersion: "0.1",
    subflows: [{ key: "main", nodes: [{ key: "wait", definitionId: WAIT_NODE_DEFINITION_ID, definitionVersion: "1.0.0", parameters: { target: { handle: "t846" }, expectedState } }] }]
  };
}

const unresolved = (path: string) => ({ severity: "error" as const, code: "bootstrap.handle_unresolved", message: "The step's `expectedState` holds \"absent\" where a handle goes, and no view printed a handle by that name.", path });

describe("feedback on an unresolved handle", () => {
  it("names the parameter, keeps Core's sentence, and gives the form the word is taken in", () => {
    const [entry] = automationStudioFlowBootstrapIssueFeedback({
      issues: [unresolved("plan.subflows.0.nodes.0.parameters.expectedState")],
      plan: planWith({ handle: "absent" }),
      registry,
      resolution
    });
    expect(entry).toMatchObject({
      code: "bootstrap.handle_unresolved",
      path: "plan.subflows.0.nodes.0.parameters.expectedState",
      message: expect.stringContaining("expectedState"),
      instead: expect.stringContaining("wait: condition=absent"),
      node: WAIT_NODE_DEFINITION_ID,
      accepted: { parameter: "expectedState" }
    });
  });

  it("gives no form for a token no parameter takes, and still names the node", () => {
    const [entry] = automationStudioFlowBootstrapIssueFeedback({
      issues: [unresolved("plan.subflows.0.nodes.0.parameters.expectedState")],
      plan: planWith({ handle: "t999" }),
      registry,
      resolution
    });
    expect(entry?.instead).toBeUndefined();
    expect(entry?.node).toBe(WAIT_NODE_DEFINITION_ID);
  });
});
