// The ratchet: a capability cannot be added with a button but no conversational
// path.
//
// The product owner's requirement is that "a user should be able to fully
// operate the entire control panel using the chat window". A requirement like
// that decays the moment it is only written down: someone adds a control, the
// conversation does not learn about it, and nobody finds out until a person
// asks for something the panel has done since February.
//
// So it is measured instead. This reads every endpoint the panel actually
// writes through -- from `.post(...)` call sites, from the `*ENDPOINTS` maps the
// command modules keep, and from the literal unions a command takes as its
// endpoint -- keeps the ones that change something, and requires each to be
// either declared in the capability catalog or named in
// `PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY` with the reason it is not. Adding a
// write with neither fails this test.
//
// Reads are left out on purpose. A read is not a capability a person is denied;
// the ones worth asking for in words -- inspecting a run, listing versions --
// are declared in the catalog anyway.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { automationStudioFeaturePath, productionSources } from "../../../architecture-test-helpers";
import { PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY, panelCapabilities, panelCapabilityEndpoints } from "../registry";

const REPOSITORY_ROOT = resolve(automationStudioFeaturePath, "../../../../..");
const CORE_ENDPOINTS_FILE = "packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts";

/**
 * Verbs that change something that outlasts the request. Written out rather
 * than inferred, because "not a read" is not the same as "a person would ask
 * for it": the list is the decision about which half of Core's surface the
 * conversation owes a path to.
 *
 * `open-` is on it because opening is not reading. `open-conversation` creates
 * a thread that outlasts the request, and without the prefix it - and any
 * future state-creating `open-*` endpoint - slipped past this ratchet
 * altogether, which is how the one write the chat window most needs could have
 * shipped with no conversational path at all.
 */
const MUTATING_VERBS = [
  "answer-", "append-", "apply-", "approve-", "archive-", "cancel-", "capture-", "clear-", "convert-",
  "create-", "delete-", "deprecate-", "disable-", "duplicate-", "enable-", "execute-", "finalize-",
  "generate-", "issue-", "learn-", "migrate-", "mine-", "mutate-", "normalize-", "open-", "pack-", "pause-",
  "process-", "propose-", "publish-", "purge-", "put-", "record-", "rename-", "reorder-", "repair-",
  "replay-", "restore-", "resume-", "review-", "revoke-", "rollback-", "run-", "save-", "seal-", "start-",
  "stop-", "update-"
];

/** Core's own endpoint names, read from the source rather than imported, so this needs no build. */
function coreEndpoints(): Set<string> {
  const source = readFileSync(resolve(REPOSITORY_ROOT, CORE_ENDPOINTS_FILE), "utf8");
  return new Set([...source.matchAll(/^\s*\w+:\s*"([a-z0-9-]+)"/gmu)].map((match) => match[1]!));
}

/** Every Core endpoint the panel writes through, and the file each was found in. */
function panelEndpointUse(known: ReadonlySet<string>): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const source of productionSources()) {
    if (source.path.replaceAll("\\", "/").startsWith("conversation/capabilities/")) continue;
    const record = (endpoint: string) => {
      if (!known.has(endpoint)) return;
      const files = found.get(endpoint) ?? new Set<string>();
      files.add(source.path);
      found.set(endpoint, files);
    };
    const visit = (node: ts.Node): void => {
      // `api.post("create-flow", ...)` and the scoped `this.postProject(...)`.
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ["post", "postProject"].includes(node.expression.name.text)) {
        const first = node.arguments[0];
        if (first && ts.isStringLiteral(first)) record(first.text);
      }
      // `const AUTOMATION_FLOW_ENDPOINTS = { publish: "publish-flow", ... }`.
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /ENDPOINTS$/u.test(node.name.text)) {
        const initializer = node.initializer && ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (initializer && ts.isObjectLiteralExpression(initializer)) {
          for (const property of initializer.properties) {
            if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) record(property.initializer.text);
          }
        }
      }
      // `endpoint: "enable-flow-subflow" | "disable-flow-subflow" | ...`.
      if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) record(node.literal.text);
      ts.forEachChild(node, visit);
    };
    visit(source.syntax);
  }
  return found;
}

function mutatingEndpointsThePanelWrites(): Map<string, Set<string>> {
  const known = coreEndpoints();
  const used = panelEndpointUse(known);
  return new Map([...used].filter(([endpoint]) => MUTATING_VERBS.some((verb) => endpoint.startsWith(verb))));
}

describe("every panel capability has a conversational path", () => {
  it("finds the panel's writes at all", () => {
    // If this ever measures nothing, everything below passes vacuously and the
    // ratchet is off without anyone noticing.
    const writes = mutatingEndpointsThePanelWrites();
    expect(writes.size).toBeGreaterThan(40);
    expect([...writes.keys()]).toContain("run-runtime-session");
    expect([...writes.keys()]).toContain("update-flow-settings");
  });

  it("declares or excuses every one of them, with no gap", () => {
    const declared = panelCapabilityEndpoints();
    const excused = new Set(Object.keys(PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY));
    const gap = [...mutatingEndpointsThePanelWrites()]
      .filter(([endpoint]) => !declared.has(endpoint) && !excused.has(endpoint))
      .map(([endpoint, files]) => `${endpoint} (written by ${[...files].join(", ")})`);
    expect(gap, [
      "These panel writes have no conversational path.",
      "Declare each in conversation/capabilities/catalog.ts, or name it in",
      "PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY with the reason a person cannot ask for it."
    ].join(" ")).toEqual([]);
  });

  it("keeps the excuse list from rotting", () => {
    // An entry for a write the panel no longer makes is a decision nobody is
    // living with any more, and it hides the next real gap behind noise.
    const writes = mutatingEndpointsThePanelWrites();
    const dead = Object.keys(PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY).filter((endpoint) => !writes.has(endpoint));
    expect(dead, "The panel no longer writes these, so they no longer need excusing.").toEqual([]);
  });

  it("never both declares and excuses the same endpoint", () => {
    const declared = panelCapabilityEndpoints();
    const both = Object.keys(PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY).filter((endpoint) => declared.has(endpoint));
    expect(both).toEqual([]);
  });

  it("gives every excuse a real reason", () => {
    for (const [endpoint, reason] of Object.entries(PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY)) {
      expect(reason.length, `${endpoint} needs a reason somebody wrote.`).toBeGreaterThan(30);
      expect(reason.trim().endsWith("."), `${endpoint}'s reason should be a sentence.`).toBe(true);
    }
  });

  it("declares only endpoints Core actually has", () => {
    const known = coreEndpoints();
    const invented = [...panelCapabilityEndpoints(), ...Object.keys(PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY)]
      .filter((endpoint) => !known.has(endpoint));
    expect(invented, "These name endpoints Core does not have.").toEqual([]);
  });

  it("reaches the capabilities a person most wants to ask for", () => {
    // The priority order the requirement was written against. A regression here
    // is the requirement failing, whatever the totals say.
    const ids = new Set(panelCapabilities().map((capability) => capability.id));
    for (const id of [
      "flow.create", "flow.describe", "flow.build", "flow.settings",
      "run.execute", "run.inspect",
      "permission.allowModelRun", "permission.revokeClient",
      "version.rollBack", "version.publish"
    ]) {
      expect(ids, `"${id}" is the kind of thing this requirement exists for.`).toContain(id);
    }
  });
});
