// The in-run repair slot and its instruction (state-aware recovery plan, C6
// step 8, C12). A runtime patch made while the run is held at the failing step
// carries `inRunRepair`, typed and bounded, and the instruction that says what
// an in-run repair is. Every other request is exactly what it was.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy } from "../../../../model/index.ts";
import {
  AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION,
  packAutomationStudioLlmContext,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmHarnessInput,
  type AutomationStudioLlmInRunRepairContext
} from "../index.ts";

const IN_RUN_ID = AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.instructionId;

describe("a runtime patch that is not an in-run repair", () => {
  // The digest and length were taken from this exact input on the harness as it
  // stood before the slot existed (t392 unit I), so this pins the bytes sent.
  it("is byte-identical to the request built before the slot existed", async () => {
    const result = await runAutomationStudioLlmHarness(notInRun());
    const bytes = JSON.stringify(result.request);
    expect(bytes.length).toBe(2941);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("1de28ba862c1161c87c04787871f0a55d1eb3851fd3246103a782b20a89cfc93");
    expect(result.request.context.instructions.instructionIds).not.toContain(IN_RUN_ID);
    expect(result.request.context).not.toHaveProperty("inRunRepair");
  });
});

describe("an in-run repair request", () => {
  it("carries the slot whole, typed, and the instruction after the stage's", async () => {
    const result = await runAutomationStudioLlmHarness({ ...notInRun(), inRunRepair: slot() });
    const context = result.request.context;
    expect(context.inRunRepair).toEqual(slot());
    const ids = context.instructions.instructionIds;
    expect(ids).toContain(IN_RUN_ID);
    expect(ids.indexOf(IN_RUN_ID)).toBe(ids.indexOf("core.loop-stage.implement") + 1);
    expect(context.instructions.instructions.find((instruction) => instruction.instructionId === IN_RUN_ID)?.body).toBe(AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.body);
    expect(result.request.promptVersion).toMatch(/\+stage\.implement\+in_run_repair$/u);
  });

  it("is told the run is held, to change only the named unit, to prefer a handler for an interruption, that the re-attempt is the trial, and never to guess a handler", () => {
    const body = AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.body;
    expect(body).toContain("The run is held at the step that failed");
    expect(body).toContain("Change only the named unit.");
    expect(body).toContain("prefer `add_handler`: give it a `when` made of conditions the page shows now");
    expect(body).toContain("a completion check that is true once the interruption is gone");
    expect(body).toContain("Otherwise use `replace_unit` for the named unit, or one of the other patch kinds offered.");
    expect(body).toContain("That attempt is the fix's trial");
    expect(body).toContain("Never add a speculative handler");
    expect(body).toContain("Never repeat an act listed as completed");
  });

  it("keeps the newest entries of each history up to a fixed count and says how many it left out", () => {
    const long = slot();
    long.recoveriesTried = Array.from({ length: 70 }, (_, index) => ({ attemptId: `a.${index}`, nodeId: "save", kind: "retry", attemptNumber: index }));
    long.actsCompleted = Array.from({ length: 500 }, (_, index) => ({ attemptId: `done.${index}`, nodeId: "row", definitionId: "builtin.data.constant" }));
    const packed = packAutomationStudioLlmContext({ ...notInRun(), inRunRepair: long }).inRunRepair!;
    expect(packed.recoveriesTried).toHaveLength(40);
    expect(packed.recoveriesTried[0]?.attemptId).toBe("a.30");
    expect(packed.actsCompleted).toHaveLength(40);
    expect(packed.actsCompleted.at(-1)?.attemptId).toBe("done.499");
    expect(packed.omitted).toEqual({ recoveriesTried: 30, actsCompleted: 460 });
    // Ten times the run, the same size of slot.
    const longer = { ...long, actsCompleted: Array.from({ length: 5_000 }, (_, index) => ({ attemptId: `done.${index}`, nodeId: "row", definitionId: "builtin.data.constant" })) };
    const size = (value: unknown) => JSON.stringify(value).length;
    expect(size(packAutomationStudioLlmContext({ ...notInRun(), inRunRepair: longer }).inRunRepair)).toBeLessThan(size(packed) + 100);
  });

  it("sends nothing shaped like a locator, withholds a contract carrying a denied key or a credential, and drops a history entry carrying one", () => {
    const located = slot();
    located.contract = { kind: "node", nodeId: "save", definitionId: "builtin.data.constant", label: "#submit-week > button.primary", parameters: { values: {} }, routes: [] };
    expect(JSON.stringify(packAutomationStudioLlmContext({ ...notInRun(), inRunRepair: located }).inRunRepair)).not.toContain("#submit-week");

    const denied = slot();
    denied.contract = { kind: "node", nodeId: "save", definitionId: "builtin.data.constant", parameters: { values: { html: "<form>" } }, routes: [] };
    expect(packAutomationStudioLlmContext({ ...notInRun(), inRunRepair: denied }).inRunRepair?.contract).toEqual({ kind: "node", withheld: "screened" });

    const secret = slot();
    const token = `sk-${"a1".repeat(16)}`;
    secret.contract = { kind: "node", nodeId: "save", definitionId: "builtin.data.constant", description: token, parameters: { values: {} }, routes: [] };
    secret.recoveriesTried = [...secret.recoveriesTried, { attemptId: "a.9", nodeId: "save", kind: "counted", note: token }];
    const packed = packAutomationStudioLlmContext({ ...notInRun(), inRunRepair: secret });
    expect(JSON.stringify(packed)).not.toContain(token);
    expect(packed.inRunRepair?.recoveriesTried).toHaveLength(1);
    expect(packed.inRunRepair?.omitted).toEqual({ recoveriesTried: 1 });
  });

  it("is a runtime patch's alone: any other task leaves the slot and its instruction out", () => {
    for (const taskKind of ["runtime_diagnosis", "loop_verification", "flow_bootstrap"] as const) {
      const { failureEvidence: _page, ...other } = notInRun();
      const packed = packAutomationStudioLlmContext({ ...other, taskKind, stage: "plan", inRunRepair: slot() });
      expect(packed, taskKind).not.toHaveProperty("inRunRepair");
      expect(packed.instructions.instructionIds, taskKind).not.toContain(IN_RUN_ID);
      expect(packed.promptVersion, taskKind).not.toContain("in_run_repair");
    }
  });
});

// User rule: model guidance never teaches to the test. The instruction's example
// is a kind of site and an act no realistic Lab scenario uses; these are the ten
// scenarios, their sites' plain words, and the words of their tasks (the list
// `flow-bootstrap/plan/tests/flow-script-format.test.ts` holds the script
// examples to, with "request" left out: an in-run repair is a request).
describe("the in-run repair instruction", () => {
  const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
  const SITE_WORDS = /store|shop|marketplace|retail|bigbox|crossborder|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu;
  const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|auction|coupon|connection|invitation|saved item|classified|giveaway|glaze|moon jar|quote|gas engineer|job|rust role|group post|feed|digest|open day|rating|shirt|colour|size\b|quantity|rate limit|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell/iu;

  it("names none of the ten realistic scenarios, their sites or their tasks", () => {
    const text = `${AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.title}\n${AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.body}`;
    for (const scenario of SCENARIOS) {
      expect(text.toLowerCase()).not.toContain(scenario);
      for (const word of scenario.split("-")) expect(text.toLowerCase(), word).not.toMatch(new RegExp(`\\b${word}\\b`, "u"));
    }
    expect(text.match(SITE_WORDS)?.[0]).toBeUndefined();
    expect(text.match(LAB_TASK_WORDS)?.[0]).toBeUndefined();
  });
});

/** A runtime patch that is not an in-run repair: today's detached patch request, built whole. */
function notInRun(): AutomationStudioLlmHarnessInput {
  return {
    taskKind: "runtime_patch",
    stage: "implement",
    previousStage: "plan",
    projectId: "project.ledger",
    flowId: "flow.timesheet",
    runId: "run.timesheet",
    nodeId: "node.submit",
    instructions: [],
    deniedEvidenceKeys: ["html"],
    failureEvidence: { schemaVersion: "probe.v1", failedAction: { nodeId: "node.submit" }, visibleText: ["Week 41", "Submit hours"] },
    policy: policy(),
    actionPermissions: { granted: [], instructed: [] },
    dryRun: true,
    requestId: "llm.runtime_patch.fixed",
    idempotencyKey: "llm.runtime_patch.fixed",
    expectedOutput: "runtime_patch",
    now: () => 1_700_000_000_000,
    metadata: { source: "runRuntimeSession", expectedOutput: "runtime_patch", allowedPatchKinds: ["temporary_wait_retry"] }
  };
}

/** A timesheet's submit step failed for good after its retries; the week's rows were already read. */
function slot(): AutomationStudioLlmInRunRepairContext {
  return {
    unit: { kind: "node", id: "save" },
    contract: { kind: "node", nodeId: "save", definitionId: "builtin.data.constant", label: "Submit the week", parameters: { values: { value: "submit" } }, routes: [{ port: "success", to: "end" }] },
    incident: { incidentId: "incident.1", origin: { framePath: ["frame.root"], nodeId: "save", failureCode: "test.target.not_found" }, handlersRun: [], routes: [], alternatives: [], trueFailure: true },
    failedAttempt: { attemptId: "save.attempt.4", nodeId: "save", definitionId: "builtin.data.constant", status: "failed", route: "failed", failure: { category: "target_not_found", code: "test.target.not_found", retryable: false } },
    recoveriesTried: [{ attemptId: "save.attempt.4", nodeId: "save", kind: "retry", attemptNumber: 4, maxAttempts: 4, rung: "retry_node" }],
    actsCompleted: [{ attemptId: "rows.attempt.1", nodeId: "rows", definitionId: "builtin.data.constant" }]
  };
}

function policy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.timesheet",
    scope: { kind: "flow", flowId: "flow.timesheet" },
    preset: "repair",
    proposalMode: "manual",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: false,
    allowCreateSubflows: false,
    allowModifyRouter: false,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
  };
}
