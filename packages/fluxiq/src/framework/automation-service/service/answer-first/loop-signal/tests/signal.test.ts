// The attempt answers `end` to both of loop detection's last rungs: a round that looped ends as a
// stall does, and what comes next is the attempt's to decide. What it counts, keeps and tells is
// held here too, from made-up rows and a real attempt record.
import { automationStudioTaskAttemptNoLoopsCaught, parseAutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE, AUTOMATION_STUDIO_LLM_LOOP_PATTERNS, automationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopSignal } from "../../../../../../runtime/llm/repeat-guard/index.ts";
import { automationStudioAnswerFirstAddLoopsCaught, automationStudioAnswerFirstLoopPattern, automationStudioAnswerFirstLoopSignal, automationStudioAnswerFirstToldTried, automationStudioAnswerFirstTriedAsContract } from "../index.ts";

const signal = (kind: AutomationStudioLlmLoopSignal["kind"]): AutomationStudioLlmLoopSignal => ({ kind, approaches: 1, pattern: "cycle", repeats: 2, toolIds: [], unchanged: ["page"] });
const KEY = "a".repeat(24);

describe("the attempt's answer to a loop signal", () => {
  it("ends the round on change_approach and asks nobody", () => {
    let asked = 0;
    expect(automationStudioAnswerFirstLoopSignal({ askPerson: () => { asked += 1; } }).loopSignal(signal("change_approach"))).toBe("end");
    expect(asked).toBe(0);
  });

  it("ends the round on ask_person and says to ask", () => {
    let asked = 0;
    expect(automationStudioAnswerFirstLoopSignal({ askPerson: () => { asked += 1; } }).loopSignal(signal("ask_person"))).toBe("end");
    expect(asked).toBe(1);
  });
});

describe("what an attempt counts", () => {
  it("sums rounds, and counts same_act under exact_repeat", () => {
    const total = automationStudioTaskAttemptNoLoopsCaught();
    const rows = [
      { resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE, resultReason: "same_act" },
      { resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES.change_approach, resultReason: "near_repeat" },
      { resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES.ask_person, resultReason: "cycle" }
    ];
    automationStudioAnswerFirstAddLoopsCaught(total, rows);
    automationStudioAnswerFirstAddLoopsCaught(total, rows);
    expect(total.exact_repeat.steered).toBe(2);
    expect(total.near_repeat.changeApproach).toBe(2);
    expect(total.cycle.askPerson).toBe(2);
  });

  it("names every pattern the loop has by one the contract has", () => {
    const none = automationStudioTaskAttemptNoLoopsCaught();
    for (const pattern of AUTOMATION_STUDIO_LLM_LOOP_PATTERNS) expect(none[automationStudioAnswerFirstLoopPattern(pattern)]).toBeDefined();
  });
});

describe("what the attempt row and a fresh round hold of the record", () => {
  it("a record with a caught same_act still parses as the contract's", () => {
    const record = automationStudioLlmLoopAttemptRecord();
    record.tried({ kind: "call", key: KEY, toolId: "core.run_node", outcome: "applied" });
    record.caught(KEY, "same_act");
    record.approachChanged();
    const read = parseAutomationStudioTriedRecord(automationStudioAnswerFirstTriedAsContract(record.data()));
    expect(read.ok).toBe(true);
    expect(read.ok ? read.record.tried[0]?.pattern : undefined).toBe("exact_repeat");
    expect(read.ok ? read.record.approaches : undefined).toBe(1);
  });

  it("a fresh round is told generic words and no digest", () => {
    const record = automationStudioLlmLoopAttemptRecord();
    record.tried({ kind: "call", key: KEY, toolId: "core.run_node", outcome: "failed" });
    record.tried({ kind: "fix", key: "b".repeat(24), toolId: "amend_draft", outcome: "undone", changes: [{ step: 2, change: "drop" }] });
    record.tried({ kind: "call", key: "c".repeat(24), toolId: "core.run_node", outcome: "applied" });
    const told = automationStudioAnswerFirstToldTried(record.data());
    expect(told).toMatchObject({ freshStarts: 0, tried: [{ kind: "call", toolId: "core.run_node", outcome: "failed", times: 1 }, { kind: "fix", toolId: "amend_draft", outcome: "undone", changes: [{ step: 2, change: "drop" }] }] });
    expect(JSON.stringify(told)).not.toContain(KEY);
  });
});
