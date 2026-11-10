// What a step that met a check only a person can clear comes to once they
// cleared it (`../person-cleared.ts`). The shape is `run-mwapfy0i-d64b26db`'s:
// a results page narrowed by a filter press, then read. The check is the
// site's traffic screen, which stands in for the results until a person passes
// it and then reloads the address that was asked for -- so whether the filter
// holds afterwards depends on whether the press was ever made.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "./fixture-contracts.ts";
import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import type { AutomationStudioFactCondition } from "../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioHostFactResult, AutomationStudioHostRuntimeBoundary } from "../../../runtime/automation-host/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, type AutomationStudioAskAnswer, type AutomationStudioParkingPort } from "../../../runtime/parking/index.ts";
import { resumeAutomationStudioGraph, runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

const NOW = 1_000;
const CHECK = { category: "user_intervention_required", code: "web.intervention.required", retryable: false, stage: "execution" } as const;
/** The domain's floor for a press: it commits, and names no consequence. */
const PRESS_FLOOR = { effectClass: "commit" as const, permissionConsequences: [] };
/** A step's `done when:` that the filter is on (`flow-bootstrap/script-statements/step-done-when.ts`). */
const FILTER_ON: JsonObject = { facts: [{ fact: "count", op: "count", value: 1, target: { locator: ".active-filter" } }] };

/**
 * The site. `checkUp`: the traffic screen stands where the results were.
 * `filtered`: the results the page holds are narrowed. `reloadKeeps`: the
 * screen's reload asks for the address the filter press went to, so a press
 * made before the screen came up still holds once it is passed.
 */
type Site = { checkUp: boolean; filtered: boolean; reloadKeeps: boolean; executed: string[]; presses: number };

/** start -> filter -> read -> done; `filter` a press, its `done when:` and metadata as the test says. */
function flow(filter: { expectedState?: JsonObject; metadata?: JsonObject } = {}): AutomationStudioFlowDocument {
  const nodes: AutomationStudioFlowDocument["nodes"] = [
    { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
    { id: "filter", definitionId: "domain.page.press", parameterValues: filter.expectedState ? { expectedState: filter.expectedState } : {}, ...(filter.metadata ? { metadata: filter.metadata } : {}) },
    { id: "read", definitionId: "domain.page.read", metadata: { effect: "observe" } },
    { id: "done", definitionId: "builtin.control.end" }
  ];
  const chain = nodes.map((node) => node.id);
  return {
    schemaVersion: "0.1",
    flowId: "flow.person-cleared",
    ownerKind: "routine",
    ownerId: "routine.person-cleared",
    name: "Person cleared",
    createdAt: 1,
    updatedAt: 1,
    nodes,
    edges: chain.slice(1).map((target, index) => ({ id: `e.${chain[index]}`, sourceNodeId: chain[index]!, targetNodeId: target, sourcePortId: "success", targetPortId: "in" }))
  };
}

/**
 * How the filter press is answered while the screen is up. `unacted`: the
 * screen was already there, the press found nothing to press and says so --
 * the run's shape. `made`: the press went, and the screen is what its
 * navigation landed on.
 */
type Meeting = "unacted" | "made";

function host(site: Site, meeting: Meeting, extra: AutomationStudioGraphExecutionOptions = {}): AutomationStudioGraphExecutionOptions {
  const facts: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    // The page the screen covers shows no filter; the results show it when they are narrowed.
    factEvaluator: (conditions: readonly AutomationStudioFactCondition[]): AutomationStudioHostFactResult[] => conditions.map(() => ({ result: !site.checkUp && site.filtered ? "true" : "false", capturedAt: 1 }))
  };
  return {
    now: () => NOW,
    delay: () => Promise.resolve(),
    hostRuntime: facts,
    resolveActionEffect: (node) => node.definitionId === "domain.page.press" ? PRESS_FLOOR : undefined,
    nativeNodeExecutor: (request) => {
      site.executed.push(request.node.id);
      if (request.node.id === "filter") return Promise.resolve({ result: pressFilter(site, meeting) });
      return Promise.resolve({ result: site.checkUp ? checkResult("unacted") : { status: "success", route: "success", outputs: { rows: site.filtered ? "narrowed" : "everything" } } });
    },
    ...extra
  };
}

function pressFilter(site: Site, meeting: Meeting): AutomationNodeExecutionResult {
  if (site.checkUp && meeting === "unacted") return checkResult("unacted");
  // A press toggles the filter: pressing it twice takes it off again.
  site.presses += 1;
  site.filtered = !site.filtered;
  return site.checkUp ? checkResult("made") : { status: "success", route: "success", outputs: {} };
}

function checkResult(meeting: Meeting): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: {}, message: "A robot check is on the page.", failure: { ...CHECK, ...(meeting === "unacted" ? { effect: "unacted" as const } : {}) } };
}

/** The person passes the screen and presses Continue; the screen reloads its address. */
function personClears(site: Site): { asks: number; port: AutomationStudioParkingPort } {
  const person = { asks: 0, port: {} as AutomationStudioParkingPort };
  person.port = {
    open: () => void (person.asks += 1),
    awaitAnswer: (ask) => {
      clear(site);
      return Promise.resolve(done(ask.askId));
    }
  };
  return person;
}

function clear(site: Site): void {
  site.checkUp = false;
  if (!site.reloadKeeps) site.filtered = false;
}

function done(askId: string): AutomationStudioAskAnswer {
  return { askId, answeredAt: NOW + 5, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, actorId: null };
}

function site(overrides: Partial<Pick<Site, "reloadKeeps">> = {}): Site {
  return { checkUp: true, filtered: false, reloadKeeps: overrides.reloadKeeps ?? true, executed: [], presses: 0 };
}

function attemptsOf(trace: AutomationStudioGraphExecutionTrace, nodeId: string) {
  return trace.attempts.filter((attempt) => attempt.nodeId === nodeId);
}

describe("a step whose check a person cleared", () => {
  it("presses again when the check kept its press from being made, so the read reads the narrowed results", async () => {
    const page = site();
    const person = personClears(page);

    const trace = await runAutomationStudioGraph(flow(), { ...host(page, "unacted"), parking: person.port });

    expect(trace.status).toBe("succeeded");
    expect(page.executed).toEqual(["filter", "filter", "read"]);
    expect(page.presses).toBe(1);
    expect(trace.values.rows).toBe("narrowed");
    const [met, pressed] = attemptsOf(trace, "filter");
    expect(met).toMatchObject({ status: "failed", failure: { code: CHECK.code, effect: "unacted" }, ask: { status: "answered", route: "success", personNeeded: true } });
    expect(pressed?.status).toBe("succeeded");
    expect(person.asks).toBe(1);
  });

  it("does the same after a durable park, once Continue resumes the run", async () => {
    const page = site();
    const parkedFlow = flow();
    const parked = await runAutomationStudioGraph(parkedFlow, { ...host(page, "unacted"), parking: { open: () => undefined } });
    expect(parked.status).toBe("waiting");
    clear(page);

    const resumed = await resumeAutomationStudioGraph({ flow: parkedFlow, trace: parked, resumption: { kind: "answer", answer: done(parked.parked!.ask.askId) }, options: host(page, "unacted") });

    expect(resumed.outcome).toBe("resumed");
    const trace = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(trace.status).toBe("succeeded");
    expect(page.executed).toEqual(["filter", "filter", "read"]);
    expect(trace.values.rows).toBe("narrowed");
  });

  it("presses again when the press was made but the page shows its effect gone after the reload", async () => {
    const page = site({ reloadKeeps: false });
    const person = personClears(page);

    const trace = await runAutomationStudioGraph(flow({ expectedState: FILTER_ON }), { ...host(page, "made"), parking: person.port });

    expect(trace.status).toBe("succeeded");
    expect(page.executed).toEqual(["filter", "filter", "read"]);
    expect(trace.values.rows).toBe("narrowed");
    expect(attemptsOf(trace, "filter")[0]?.effectCheck?.result).toBe("not_landed");
  });

  it("does not press again when the page shows the press's effect held, since pressing a filter twice takes it off", async () => {
    const page = site({ reloadKeeps: true });
    const person = personClears(page);

    const trace = await runAutomationStudioGraph(flow({ expectedState: FILTER_ON }), { ...host(page, "made"), parking: person.port });

    expect(trace.status).toBe("succeeded");
    expect(page.executed).toEqual(["filter", "read"]);
    expect(page.presses).toBe(1);
    expect(trace.values.rows).toBe("narrowed");
    expect(attemptsOf(trace, "filter")[0]?.effectCheck?.result).toBe("landed");
  });

  it("goes on from a plain press that was made and says nothing of what it leaves: its address carries it", async () => {
    const page = site({ reloadKeeps: true });
    const person = personClears(page);

    const trace = await runAutomationStudioGraph(flow(), { ...host(page, "made"), parking: person.port });

    expect(trace.status).toBe("succeeded");
    expect(page.executed).toEqual(["filter", "read"]);
    expect(page.presses).toBe(1);
    expect(trace.values.rows).toBe("narrowed");
    expect(attemptsOf(trace, "filter")[0]?.effectCheck).toBeUndefined();
  });

  it("holds a lasting act the check answered when the page cannot show whether it landed, and never makes it again", async () => {
    const page = site({ reloadKeeps: true });
    const person = personClears(page);

    const trace = await runAutomationStudioGraph(flow({ metadata: { declaredConsequences: ["create_new"] } }), { ...host(page, "made"), parking: person.port });

    expect(trace.status).toBe("failed");
    expect(trace.failure).toMatchObject({ code: "run.outcome_uncertain" });
    expect(trace.currentNodeId).toBe("filter");
    expect(page.executed).toEqual(["filter"]);
    expect(page.presses).toBe(1);
    expect(attemptsOf(trace, "filter")[0]?.effectCheck?.result).toBe("unknown");
  });

  it("reads again when a read met the check, rather than going on with nothing read", async () => {
    const page = site();
    page.checkUp = false;
    let screens = 1;
    const options = host(page, "unacted", {
      nativeNodeExecutor: (request) => {
        page.executed.push(request.node.id);
        if (request.node.id === "filter") return Promise.resolve({ result: pressFilter(page, "unacted") });
        // The read's load is the one the screen replaces.
        if (screens > 0) {
          screens -= 1;
          page.checkUp = true;
          return Promise.resolve({ result: checkResult("made") });
        }
        return Promise.resolve({ result: { status: "success", route: "success", outputs: { rows: page.filtered ? "narrowed" : "everything" } } });
      }
    });

    const trace = await runAutomationStudioGraph(flow(), { ...options, parking: personClears(page).port });

    expect(trace.status).toBe("succeeded");
    expect(page.executed).toEqual(["filter", "read", "read"]);
    expect(trace.values.rows).toBe("narrowed");
  });
});
