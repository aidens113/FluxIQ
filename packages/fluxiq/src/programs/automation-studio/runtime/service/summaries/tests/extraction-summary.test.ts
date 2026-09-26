// A list read's own account of itself, from the dispatched result to the run
// detail a finished run is read from.
//
// The point of these tests is the distinction the run record could not make
// before. An attempt that stored no rows carried `metadata.recordCount` and
// nothing else, so a read whose selector named nothing, a read of a page that
// held nothing, and a read whose `where` rejected every row were the same
// record. Each wants a different repair.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../../io/index.ts";
import { RuntimeService } from "../../../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../../executor.ts";
import { createRuntimePolicyEffectDispatcher } from "../../../io-policy.ts";
import { runtimeSessionToFlowRunDetail } from "../../index.ts";
import { extractionSummaryFromOutputs } from "../extraction-summary.ts";

const READ = { recordCount: 8, pagesRead: 1, truncated: false, fieldNames: ["name", "price"], missingFields: [] };

describe("a list read's summary on a saved attempt", () => {
  it("reaches the run detail, so a read that found rows says how many over how many pages", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.extract_list",
      status: "succeeded",
      extraction: { ...READ, listPresence: "appeared", missingFields: ["price"] }
    });

    expect(detail.actionAttempts?.[0]?.metadata?.extraction).toEqual({
      recordCount: 8,
      pagesRead: 1,
      truncated: false,
      fieldNames: ["name", "price"],
      missingFields: ["price"],
      listPresence: "appeared"
    });
  });

  it("says a list never appeared, which no count on the attempt could have said", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.extract_list",
      status: "succeeded",
      extraction: { ...READ, recordCount: 0, listPresence: "never_appeared" }
    });

    expect(detail.actionAttempts?.[0]?.metadata?.extraction).toMatchObject({ recordCount: 0, listPresence: "never_appeared" });
  });

  it("carries nothing for an attempt whose host reported no summary, rather than an empty record", async () => {
    const detail = await runDetailFor({ commandId: "command.runtime", status: "succeeded", url: "https://example.test/" });

    expect(detail.actionAttempts?.[0]?.metadata).not.toHaveProperty("extraction");
  });
});

describe("what the projection admits", () => {
  // The payload arrives from a downstream host and is parsed, not typed, so
  // each of these is a value that could arrive and must not be republished.
  it("keeps the condition report's counts, which is how a read that rejected every row is told from an empty page", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, recordCount: 30, conditions: { applied: 30, kept: 0, rejected: [30, 2], unfiltered: true } } } }))
      .toEqual({ recordCount: 30, pagesRead: 1, truncated: false, fieldNames: ["name", "price"], missingFields: [], conditions: { applied: 30, kept: 0, rejected: [30, 2], unfiltered: true } });
  });

  it("refuses a presence word this Core does not know, so a word the domain adds stays behind until it is named", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listPresence: "perhaps" } } })).toBeUndefined();
  });

  it("refuses a count that is not a count", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, recordCount: "eight" } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, pagesRead: -1 } } })).toBeUndefined();
  });

  it("refuses a field key that could carry page text, and a missing field the read never declared", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, fieldNames: ["Ships in 2 days"] } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, missingFields: ["discount"] } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, fieldNames: ["__proto__"] } } })).toBeUndefined();
  });

  it("refuses a condition report that kept more than it looked at, or whose rejections are unbounded", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: { applied: 2, kept: 3, rejected: [], unfiltered: false } } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: { applied: 2, kept: 1, rejected: Array.from({ length: 65 }, () => 0), unfiltered: false } } } })).toBeUndefined();
  });

  it("carries nothing extra the host put beside the members it knows", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, itemSelector: ".product-card" } } })).toEqual(READ);
  });

  it("finds the summary one level further in, where the gateway dispatcher's own wrapper puts it", () => {
    // The route a paired browser client's read actually takes: the domain's
    // gateway output dispatcher answers `{ status, message, result }`.
    expect(extractionSummaryFromOutputs({ result: { status: "succeeded", message: "List extracted.", result: { extraction: READ } } })).toEqual(READ);
  });

  it("carries nothing for an attempt that dispatched nothing, or whose result payload was withheld", () => {
    expect(extractionSummaryFromOutputs({})).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: "[withheld]" })).toBeUndefined();
    expect(extractionSummaryFromOutputs(undefined)).toBeUndefined();
  });
});

/** One dispatched action whose host answered with `payload`, as the run detail states it. */
async function runDetailFor(payload: JsonObject) {
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1",
    flowId: "flow.extraction-summary",
    ownerKind: "task",
    ownerId: "task.extraction-summary",
    name: "Extraction summary",
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "read-list", parameters: { item: "card" } } }],
    edges: []
  };
  const io = new IoRegistry();
  io.registerOutput("example", defineOutput({
    definition: { id: "read-list", title: "Read list" },
    mode: "request",
    dispatch: (request) => ({ ok: true, outputId: request.outputId })
  }));
  const runtime = new RuntimeService();
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["read-list"] }],
    execute: (command) => ({ commandId: command.commandId ?? "command.runtime", status: "succeeded", payload })
  });
  const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(io, "example", runtime) });
  const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId: "run.extraction-summary", projectId: "project.extraction", targetKind: "flow", targetId: flow.flowId, flowId: flow.flowId, status: "succeeded", queuedAt: 1, flow, trace };
  return runtimeSessionToFlowRunDetail(session, "project.extraction");
}
