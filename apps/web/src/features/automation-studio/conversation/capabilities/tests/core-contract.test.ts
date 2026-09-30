// Every chat capability sends a request Core actually accepts.
//
// The defect this file exists to stop is a capability whose own tests are green
// while Core refuses every request it makes. Three were found that way on
// 2026-09-28, by live DeepSeek calls rather than by any test:
//
// - `flow.settings` spread its settings into the request, and Core refused
//   every one with "Flow settings are required.".
// - `version.rollBack` and `version.accept` sent `decision` with no `flowId`,
//   where Core reads `action` and `flowId`.
// - An argument renamed onto `projectId` was overwritten by the thread's own.
//
// The catalog's tests checked the capability's own shape, never Core's. So this
// test runs every capability in the registry through `dispatchPanelCapability`,
// the way the chat window runs it. It sends the request to Core's real handler
// on a real service (`core-contract-world.ts`), and it requires three things:
//
// 1. Core accepted it.
// 2. Every field the capability sent was read by Core.
// 3. Every endpoint the capability declares was reached.
//
// It is driven from the registry, so a new capability is covered the day it is
// added. If a capability cannot be exercised, the test fails and names what is
// missing.

import { afterAll, describe, expect, it } from "vitest";
import type { ProgramEndpointClassification } from "../../../../../../../../packages/fluxiq/src/programs/_shared/api.ts";
import { panelCapabilityAsksFirst, type PanelCapability } from "../contract";
import { dispatchPanelCapability } from "../dispatch";
import { PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY, panelCapabilities } from "../registry";
import { contractOverrideIds, contractVariants } from "./core-contract-arguments";
import { CONTRACT_PIN, closeContractSeed, contractClassifications, openContractWorld, type ContractExchange, type ContractWorld } from "./core-contract-world";

/**
 * A refusal the contract world cannot get past, and why.
 *
 * Each entry has to name the refusal exactly, and that refusal has to come
 * from beyond the request's own validation. Anything else is the defect this
 * file looks for. The list is expected to stay short.
 */
const EXPECTED_REFUSALS: Readonly<Record<string, { error: RegExp; because: string }>> = {
  // Exploring opens the real website through a paired browser, and Core runs it
  // on the evidence tools that browser binds. The contract world has no
  // browser, and a Core with no evidence tools bound must refuse an
  // exploration rather than build from nothing, so this refusal is the correct
  // behaviour. It is Core's service refusing after the handler accepted the
  // request and read every field; a request defect would be
  // refused earlier, in other words, and would still fail here.
  "flow.explore": {
    error: /^Flow Bootstrap generation failed \(flow_bootstrap\.evidence_runtime_unavailable\)\.$/u,
    because: "The contract world binds no browser, so Core has no evidence tools to explore with."
  },
  // Improving a Flow extends the steps it already has. The world's Flow has a
  // Router and Subflows but no steps in any of them, so after the handler has
  // read every field -- `mode` among them -- the service refuses to extend a Flow with nothing to
  // amend. That is Core declining an empty Flow, not a request defect; a
  // malformed request would be refused by the handler instead.
  "flow.improve": {
    error: /^Flow Bootstrap generation failed \(flow_bootstrap\.blank_target_required\)\.$/u,
    because: "The world's Flow has a Router and Subflows but no steps in them, so there is nothing to extend."
  },
  // The world's seeded adaptation edits an expectation (`expect.ready`) that no
  // node in its Flow carries. Core approves it -- the request is sound -- and
  // then refuses to apply a patch to a node that does not exist, which is the
  // apply path's own integrity check rather than anything in the request.
  "adaptation.apply": {
    error: /^Unknown Flow node for adaptation patch: expect\.ready$/u,
    because: "The seeded adaptation targets a node the seeded Flow does not have, so it can be approved but not applied."
  }
};

const PLACEHOLDER_IDS: ContractWorld["ids"] = {
  projectId: "p", flowId: "f", blankFlowId: "b", subflowId: "s", runId: "r", recordingId: "rec", adaptationId: "a", routeId: "rt", trustedClientId: "c", version: "v"
};

/** The variant labels, or the reason the capability cannot be exercised at all. */
function variantLabels(capability: PanelCapability): string[] | Error {
  try {
    return contractVariants(capability, PLACEHOLDER_IDS).map((variant) => variant.label);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

type Result = { capability: string; variant: string; endpoints: string; verdict: string };
const results: Result[] = [];

/** Every leaf path of what was sent: `a.b` for a value, `a[]` for a list. */
function leaves(value: unknown, at: string): string[] {
  if (Array.isArray(value)) return [`${at}[]`];
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return [at];
    return entries.flatMap(([key, child]) => leaves(child, at ? `${at}.${key}` : key));
  }
  return [at];
}

/** Fields the capability sent that nothing in Core ever read. */
function dropped(exchange: ContractExchange): string[] {
  if (!exchange.sent) return [];
  return leaves(exchange.sent, "").filter((leaf) => !exchange.reads.has(leaf));
}

function exchangeProblems(capability: PanelCapability, exchange: ContractExchange): string[] {
  const problems: string[] = [];
  if (!exchange.response.ok) {
    const expected = EXPECTED_REFUSALS[capability.id];
    if (!expected || !expected.error.test(exchange.response.error ?? "")) {
      problems.push(`${exchange.endpoint} refused: ${exchange.response.error ?? "(no reason)"}`);
    }
  }
  const lost = dropped(exchange);
  if (lost.length) problems.push(`${exchange.endpoint} never read ${lost.join(", ")}`);
  return problems;
}

describe("every chat capability sends a request Core accepts", () => {
  afterAll(async () => {
    await closeContractSeed();
    const passed = results.filter((result) => result.verdict === "accepted").length;
    const lines = results.map((result) => `${result.verdict === "accepted" ? "PASS" : "FAIL"} ${result.capability} [${result.variant}] -> ${result.endpoints}${result.verdict === "accepted" ? "" : ` :: ${result.verdict}`}`);
    console.log([`capability contract: ${passed}/${results.length} variants accepted by Core across ${panelCapabilities().length} capabilities`, ...lines].join("\n"));
  });

  for (const capability of panelCapabilities()) {
    const labels = variantLabels(capability);
    if (labels instanceof Error) {
      it(`${capability.id} can be exercised`, () => {
        results.push({ capability: capability.id, variant: "none", endpoints: "(none)", verdict: labels.message });
        throw labels;
      });
      continue;
    }
    for (const label of labels) {
      it(`${capability.id} [${label}]`, async () => {
        const world = await openContractWorld();
        const record = (verdict: string) => results.push({
          capability: capability.id,
          variant: label,
          endpoints: [...new Set(world.exchanges.map((exchange) => exchange.endpoint))].join(", ") || "(none)",
          verdict
        });
        try {
          const variant = contractVariants(capability, world.ids).find((candidate) => candidate.label === label)!;
          const asksFirst = panelCapabilityAsksFirst(capability);
          const dispatched = await dispatchPanelCapability(
            { transport: world.transport, projectId: world.ids.projectId, ...(asksFirst ? { authorizationPin: CONTRACT_PIN } : {}) },
            { capabilityId: capability.id, arguments: variant.arguments }
          );
          const problems = world.exchanges.flatMap((exchange) => exchangeProblems(capability, exchange));
          if (!world.exchanges.length) problems.push(`it never reached Core: ${dispatched.outcome.summary} ${"error" in dispatched.outcome ? dispatched.outcome.error : ""}`.trim());
          else if (dispatched.outcome.status !== "done" && !EXPECTED_REFUSALS[capability.id]) problems.push(`it ended "${dispatched.outcome.status}": ${dispatched.outcome.summary}`);
          record(problems.length ? problems.join("; ") : "accepted");
          expect(problems, `${capability.id} [${label}]`).toEqual([]);
        } finally {
          await world.close();
        }
      }, 30_000);
    }
  }

  it("reaches every endpoint each capability declares, across its variants", () => {
    const reached = new Map<string, Set<string>>();
    for (const result of results) {
      const set = reached.get(result.capability) ?? new Set<string>();
      for (const endpoint of result.endpoints.split(", ")) set.add(endpoint);
      reached.set(result.capability, set);
    }
    const unreached = panelCapabilities().flatMap((capability) => capability.endpoints
      .filter((endpoint) => !reached.get(capability.id)?.has(endpoint))
      .map((endpoint) => `${capability.id} -> ${endpoint}`));
    expect(unreached, "Declared endpoints no variant reached. Add a variant in core-contract-arguments.ts.").toEqual([]);
  });

  it("keeps overrides only for capabilities that exist", () => {
    const ids = new Set(panelCapabilities().map((capability) => capability.id));
    expect(contractOverrideIds().filter((id) => !ids.has(id))).toEqual([]);
    expect(Object.keys(EXPECTED_REFUSALS).filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("the capability catalog agrees with Core's own classification", () => {
  // Classifications come from registering the handlers, which reads no data,
  // so these no longer open a seeded world.
  let classifications: Promise<ReadonlyMap<string, ProgramEndpointClassification>> | undefined;
  const classified = async () => await (classifications ??= contractClassifications());

  it("declares only endpoints Core has a handler for", async () => {
    const known = await classified();
    const missing = panelCapabilities().flatMap((capability) => capability.endpoints.filter((endpoint) => !known.has(endpoint)).map((endpoint) => `${capability.id} -> ${endpoint}`));
    expect(missing).toEqual([]);
  });

  it("excuses only endpoints Core has a handler for", async () => {
    const known = await classified();
    expect(Object.keys(PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY).filter((endpoint) => !known.has(endpoint))).toEqual([]);
  });

  it("asks for a PIN exactly where Core requires one", async () => {
    // Core's registry demands the operator's PIN for a `destructive` endpoint
    // and for nothing else. A capability that asks first for an endpoint Core
    // treats as authoring stops the person for no reason. One that does not
    // ask first, for an endpoint Core treats as destructive, is refused by Core
    // every time, because the chat never takes a PIN from the model.
    const known = await classified();
    const disagreements = panelCapabilities().flatMap((capability) => {
      const classes = capability.endpoints.map((endpoint) => known.get(endpoint));
      const coreWantsPin = classes.includes("destructive");
      const asks = panelCapabilityAsksFirst(capability);
      return asks === coreWantsPin ? [] : [`${capability.id}: asks first=${asks}, Core classes ${capability.endpoints.map((endpoint, index) => `${endpoint}=${classes[index]}`).join(", ")}`];
    });
    expect(disagreements).toEqual([]);
  });

  it("declares a PIN argument only where it asks first", () => {
    // A PIN the capability requires but never asks for can only come from the
    // model, and Core never takes one from the model. So dispatch refuses the
    // capability for a missing PIN every time it is asked for in words.
    const stranded = panelCapabilities()
      .filter((capability) => capability.arguments.some((argument) => argument.name === "authorizationPin") !== panelCapabilityAsksFirst(capability))
      .map((capability) => capability.id);
    expect(stranded).toEqual([]);
  });

  it("calls a capability a read exactly when Core does", async () => {
    const known = await classified();
    const disagreements = panelCapabilities().flatMap((capability) => {
      const allReads = capability.endpoints.every((endpoint) => known.get(endpoint) === "read");
      const changesNothing = capability.consequences.length === 0;
      return allReads === changesNothing ? [] : [`${capability.id}: consequences=[${capability.consequences.join(",")}], Core classes ${capability.endpoints.map((endpoint) => `${endpoint}=${known.get(endpoint)}`).join(", ")}`];
    });
    expect(disagreements).toEqual([]);
  });
});
