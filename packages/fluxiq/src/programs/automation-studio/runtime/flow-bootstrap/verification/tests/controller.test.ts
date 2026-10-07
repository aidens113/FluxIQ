import { describe, expect, it } from "vitest";
import { AutomationStudioCandidateVerificationController, type AutomationStudioCandidateRequirementBrief, type AutomationStudioCandidateExecutionReceipt, type AutomationStudioCandidateObservedEvidence, type AutomationStudioCandidateVerificationIdentity, type AutomationStudioCandidateVerificationPorts } from "../index.ts";

const candidate = { projectId: "project.test", flowId: "flow.test", revision: 1, digest: "graph.digest", baseDependencyDigest: "accepted.base" };
const brief: AutomationStudioCandidateRequirementBrief = {
  interpretationStatus: "complete",
  instructions: [{ instructionId: "instruction.original", text: "Ensure both requested subjects have the required setting." }],
  requirements: [{ requirementId: "requirement.setting", source: { instructionId: "instruction.original", start: 0, end: 56 }, mode: "ensure", subjects: { kind: "explicit", subjectIds: ["item.one", "item.two"] }, predicates: [{ kind: "equals", field: "setting", value: "desired" }] }]
};
function harness(options: {
  brief?: AutomationStudioCandidateRequirementBrief;
  execution?: (receipt: AutomationStudioCandidateExecutionReceipt) => AutomationStudioCandidateExecutionReceipt;
  observation?: (packet: AutomationStudioCandidateObservedEvidence) => AutomationStudioCandidateObservedEvidence;
  duringObserve?: () => void;
  duringExecute?: () => void;
  signal?: AbortSignal;
  prepare?: AutomationStudioCandidateVerificationPorts["prepareStart"];
  promotion?: AutomationStudioCandidateVerificationPorts["promote"];
} = {}) {
  let identity: AutomationStudioCandidateVerificationIdentity;
  const promoted: unknown[] = [], executions: unknown[] = [];
  const ports: AutomationStudioCandidateVerificationPorts = {
    currentIdentity: async () => identity,
    prepareStart: options.prepare ?? (async ({ conditionsDigest }) => ({ receiptId: "start.test", conditionsDigest, preparedAt: 1, pageGeneration: 2, subjectStates: ["item.one", "item.two"].map((subjectId, index) => ({ observationId: `baseline.${index}`, subjectId, existed: false, observedAt: 1, pageGeneration: 2 })) })),
    execute: async ({ identity, runId, start }) => {
      executions.push(runId); options.duringExecute?.();
      const value: AutomationStudioCandidateExecutionReceipt = { identity, runId, startReceiptId: start.receiptId, startedAt: 2, finishedAt: 4, status: "succeeded", executedNodeCount: 2, commands: [{ commandId: "command.new", subjectIds: ["item.one", "item.two"], outcome: "performed", finishedAt: 3 }] };
      return options.execution?.(value) ?? value;
    },
    observe: async ({ identity, execution, start }) => {
      options.duringObserve?.();
      const packet: AutomationStudioCandidateObservedEvidence = { identity, runId: execution.runId, startReceiptId: start.receiptId, observations: ["item.one", "item.two"].map((subjectId, index) => ({ observationId: `observation.${index}`, pageGeneration: 3, observedAt: 5, subjectId, fields: { setting: "desired" }, completeFields: ["setting"], newlyProduced: { commandId: "command.new", startObservationId: `baseline.${index}` } })), enumerations: [{ observationId: "enumeration.test", pageGeneration: 3, observedAt: 5, scopeId: "requested.subjects", subjectIds: ["item.one", "item.two"], complete: true }] };
      return options.observation?.(packet) ?? packet;
    },
    promote: async (input) => { promoted.push(input); return options.promotion ? options.promotion(input) : "promoted"; }
  };
  const controller = new AutomationStudioCandidateVerificationController({ candidate, brief: options.brief ?? brief, conditionsDigest: "clean.start", ports, ...(options.signal ? { signal: options.signal } : {}) });
  identity = controller.expectedIdentity();
  return { controller, promoted, executions, changeIdentity: (change: Partial<AutomationStudioCandidateVerificationIdentity>) => { identity = { ...identity, ...change }; } };
}
function requirements(mode: "create" | "ensure" = "ensure"): AutomationStudioCandidateRequirementBrief {
  return { ...brief, requirements: brief.requirements.map((entry) => ({ ...entry, mode })) };
}

describe("trusted candidate acceptance receipts", () => {
  it("promotes only after independent observations satisfy every requirement", async () => {
    const h = harness();
    const result = await h.controller.verifyAndPromote();
    expect(result.status).toBe("promoted");
    expect(result.receipt?.verdict).toBe("satisfied");
    expect(h.promoted).toHaveLength(1);
  });
  it("wrong qualifier/origin and only one of two pickup settings cannot pass", async () => {
    for (const field of ["shippingOrigin", "pickupSetting"]) {
      const b = { ...brief, requirements: brief.requirements.map((entry) => ({ ...entry, predicates: [{ kind: "equals" as const, field, value: "required" }] })) };
      const h = harness({ brief: b, observation: (packet) => ({ ...packet, observations: packet.observations.map((entry, index) => ({ ...entry, fields: { [field]: index ? "wrong" : "required", sellerAddress: "required" }, completeFields: [field] })) }) });
      const result = await h.controller.verifyAndPromote();
      expect(result).toMatchObject({ status: "draft", code: "candidate.requirements_unsatisfied", receipt: { verdict: "unsatisfied" } });
      expect(h.promoted).toEqual([]);
    }
  });
  it("missing subject/field and partial quantified scope remain unknown", async () => {
    const all = { ...brief, requirements: brief.requirements.map((entry) => ({ ...entry, subjects: { kind: "all" as const, scopeId: "requested.subjects" } })) };
    for (const mutate of [
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, observations: p.observations.slice(0, 1) }),
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, observations: p.observations.map((o) => ({ ...o, fields: {}, completeFields: [] })) }),
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, enumerations: [{ observationId: "enumeration.test", pageGeneration: 3, observedAt: 5, scopeId: "requested.subjects", subjectIds: ["item.one"], complete: false }] })
    ]) {
      const h = harness({ brief: all, observation: mutate });
      expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unknown" });
      expect(h.promoted).toEqual([]);
    }
  });
  it("concrete contradiction outranks an incomplete observation and claimed semantic yes", async () => {
    const h = harness({ observation: (packet) => ({ ...packet, observations: packet.observations.map((entry) => ({ ...entry, fields: { setting: "wrong", success: true, answersRequest: "yes" }, completeFields: [] })) }) });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unsatisfied" });
  });
  it("builder success fields cannot establish required facts", async () => {
    const h = harness({ observation: (packet) => ({ ...packet, observations: packet.observations.map((entry) => ({ ...entry, fields: { success: true, answersRequest: "yes" }, completeFields: ["success", "answersRequest"] })) }) });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unknown" });
    expect(h.promoted).toEqual([]);
  });
  it.each(["withheld", "no_op", "unknown"] as const)("create cannot pass a %s command despite existing desired state", async (outcome) => {
    const h = harness({ brief: requirements("create"), execution: (e) => ({ ...e, commands: e.commands.map((command) => ({ ...command, outcome })) }) });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unknown" });
  });
  it("zero executed nodes cannot prove create, while ensure may prove already satisfied state", async () => {
    for (const mode of ["create", "ensure"] as const) {
      const h = harness({ brief: requirements(mode), execution: (e) => ({ ...e, executedNodeCount: 0, commands: [] }), observation: (p) => ({ ...p, observations: p.observations.map(({ newlyProduced: _, ...kept }) => kept) }) });
      expect((await h.controller.verifyAndPromote()).status).toBe(mode === "ensure" ? "promoted" : "draft");
    }
  });
  it("create needs observed newness and matching subject/command attribution", async () => {
    for (const kind of ["missing", "wrong_command", "wrong_subject"] as const) {
      const h = harness({ brief: requirements("create"), execution: (e) => kind === "wrong_subject" ? { ...e, commands: e.commands.map((command) => ({ ...command, subjectIds: ["other"] })) } : e, observation: (p) => ({ ...p, observations: p.observations.map(({ newlyProduced: _, ...kept }, index) => kind === "missing" ? kept : { ...kept, newlyProduced: { commandId: kind === "wrong_command" ? "other" : "command.new", startObservationId: `baseline.${index}` } }) }) });
      expect((await h.controller.verifyAndPromote()).status).toBe("draft");
    }
  });
  it("a properly attributed create can pass", async () => {
    expect((await harness({ brief: requirements("create") }).controller.verifyAndPromote()).status).toBe("promoted");
  });
  it.each(["revision", "digest", "baseDependencyDigest", "requirementsDigest"] as const)("rejects changed %s during observation", async (field) => {
    let h: ReturnType<typeof harness>;
    h = harness({ duringObserve: () => h.changeIdentity(field === "revision" ? { revision: 2 } : { [field]: "new" }) });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.stale_or_cancelled" });
    expect(h.promoted).toEqual([]);
  });
  it("cancellation before dispatch and after late execution prevents promotion", async () => {
    const before = new AbortController(); before.abort();
    const first = harness({ signal: before.signal });
    expect((await first.controller.verifyAndPromote()).status).toBe("draft");
    expect(first.executions).toEqual([]);
    const late = new AbortController();
    const next = harness({ signal: late.signal, duringExecute: () => late.abort() });
    expect((await next.controller.verifyAndPromote()).status).toBe("draft");
    expect(next.promoted).toEqual([]);
  });
  it("wrong run/candidate/start/generation/time evidence cannot verify", async () => {
    for (const change of [
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, runId: "old.run" }),
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, identity: { ...p.identity, revision: 0 } }),
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, startReceiptId: "old.start" }),
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, observations: p.observations.map((o) => ({ ...o, pageGeneration: 0 })) }),
      (p: AutomationStudioCandidateObservedEvidence) => ({ ...p, observations: p.observations.map((o) => ({ ...o, observedAt: 1 })) })
    ]) {
      const h = harness({ observation: change });
      expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.observation_provenance_invalid" });
      expect(h.promoted).toEqual([]);
    }
  });
  it("deduplicates concurrent and later promotion requests in this attempt", async () => {
    const h = harness();
    const results = await Promise.all([h.controller.verifyAndPromote(), h.controller.verifyAndPromote()]);
    expect(results.map((r) => r.status)).toEqual(["promoted", "promoted"]);
    expect((await h.controller.verifyAndPromote()).status).toBe("promoted");
    expect(h.executions).toHaveLength(1);
    expect(h.promoted).toHaveLength(1);
  });
  it("CAS port can refuse a late accepted-base change", async () => {
    const h = harness({ promotion: async () => "stale" });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.promotion_stale" });
  });
  it("unconfirmed start conditions never dispatch execution", async () => {
    const h = harness({ prepare: async () => ({ receiptId: "start.wrong", conditionsDigest: "wrong", preparedAt: 1, pageGeneration: 1, subjectStates: [] }) });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.start_unconfirmed" });
    expect(h.executions).toEqual([]);
  });
  it("preserves original requirements against external mutation", async () => {
    const mutable = structuredClone(brief) as { instructions: { instructionId: string; text: string }[]; requirements: any[] };
    const h = harness({ brief: mutable });
    mutable.requirements[0].predicates[0].value = "wrong";
    expect((await h.controller.verifyAndPromote()).status).toBe("promoted");
  });
});

it("partial lists cannot refute or satisfy a count without sufficient coverage", async () => {
  for (const kind of ["count_equals", "count_at_least", "contains"] as const) {
    const b: AutomationStudioCandidateRequirementBrief = { ...brief, requirements: [{ ...brief.requirements[0]!, subjects: { kind: "explicit", subjectIds: ["item.one"] }, predicates: [kind === "contains" ? { kind, field: "rows", value: "missing" } : { kind, field: "rows", value: 3 }] }] };
    const h = harness({ brief: b, observation: (p) => ({ ...p, observations: [{ ...p.observations[0]!, fields: { rows: ["one", "two"] }, completeFields: [] }] }) });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unknown" });
  }
});

it("a partial list that already exceeds an exact count contradicts it", async () => {
  const b: AutomationStudioCandidateRequirementBrief = { ...brief, requirements: [{ ...brief.requirements[0]!, subjects: { kind: "explicit", subjectIds: ["item.one"] }, predicates: [{ kind: "count_equals", field: "rows", value: 1 }] }] };
  const h = harness({ brief: b, observation: (p) => ({ ...p, observations: [{ ...p.observations[0]!, fields: { rows: ["one", "two"] }, completeFields: [] }] }) });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unsatisfied" });
});

it("rejects stale enumeration provenance even for a zero-match ensure", async () => {
  const b: AutomationStudioCandidateRequirementBrief = { ...brief, requirements: [{ ...brief.requirements[0]!, subjects: { kind: "all", scopeId: "requested.subjects" } }] };
  const h = harness({ brief: b, observation: (p) => ({ ...p, observations: [], enumerations: [{ ...p.enumerations[0]!, subjectIds: [], observedAt: 0 }] }) });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.observation_provenance_invalid" });
});

it("rejects malformed promotion acknowledgment instead of treating it as success", async () => {
  const h = harness({ promotion: async () => undefined as unknown as "promoted" });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.promotion_unconfirmed" });
});

it("rejects invalid instruction source spans before execution", () => {
  expect(() => harness({ brief: { ...brief, requirements: [{ ...brief.requirements[0]!, source: { instructionId: "instruction.original", start: 0, end: 1000 } }] } })).toThrow(/source span/);
});

it("retains the satisfied receipt after an uncertain promotion acknowledgment without retrying", async () => {
  const h = harness({ promotion: async () => { throw new Error("Acknowledgment unavailable."); } });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.promotion_outcome_unknown", receipt: { verdict: "satisfied" } });
  await h.controller.verifyAndPromote();
  expect(h.promoted).toHaveLength(1);
});

it("missing or partial instruction interpretation remains unknown before any dispatch", async () => {
  for (const b of [{ ...brief, interpretationStatus: "partial" as const }, { instructions: brief.instructions, requirements: brief.requirements }, { ...brief, instructions: [...brief.instructions, { instructionId: "unmapped", text: "Unsupported numeric ordering qualifier." }] }]) {
    const h = harness({ brief: b });
    expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_interpretation_unknown" });
    expect(h.executions).toEqual([]);
  }
});

it("create must cite an observed absent baseline for the same subject", async () => {
  const h = harness({ brief: requirements("create"), observation: (p) => ({ ...p, observations: p.observations.map((o) => ({ ...o, newlyProduced: { commandId: "command.new", startObservationId: "absent.receipt" } })) }) });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unknown" });
});

it("malformed command receipt is never sufficient execution evidence", async () => {
  const h = harness({ execution: (e) => ({ ...e, commands: e.commands.map((command) => ({ ...command, commandId: "" })) }) });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.execution_receipt_invalid" });
});

it("an empty complete enumeration cannot prove creation", async () => {
  const b: AutomationStudioCandidateRequirementBrief = { ...brief, requirements: [{ ...brief.requirements[0]!, mode: "create", subjects: { kind: "all", scopeId: "requested.subjects" } }] };
  const h = harness({ brief: b, observation: (p) => ({ ...p, observations: [], enumerations: p.enumerations.map((e) => ({ ...e, subjectIds: [] })) }) });
  expect(await h.controller.verifyAndPromote()).toMatchObject({ status: "draft", code: "candidate.requirements_unknown" });
});
