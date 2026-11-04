import { describe, expect, it } from "vitest";
import { parseAutomationStudioTriedRecord, type AutomationStudioTriedRecord } from "../index.ts";

// Keys as the Loop Detection lane mints them: 24 hex for a call's digest, 32 hex for a draft's key.
const VALID: AutomationStudioTriedRecord = {
  version: 1,
  tried: [
    { kind: "call", key: "0123456789abcdef01234567", toolId: "core.read_page", outcome: "changed_nothing", times: 3, pattern: "near_repeat" },
    { kind: "fix", key: "0123456789abcdef0123456789abcdef", toolId: "amend_draft", outcome: "undone", times: 2, pattern: "same_fix", changes: [{ step: 4, change: "replace" }] },
    { kind: "fix", key: "fedcba9876543210fedcba98", toolId: "submit_flow", outcome: "failed", times: 1 }
  ],
  approaches: 1
};

function issuesOf(value: unknown): string[] {
  const result = parseAutomationStudioTriedRecord(value);
  return result.ok ? [] : result.issues;
}

function withEntry(entry: Record<string, unknown>): unknown {
  return { ...VALID, tried: [{ ...VALID.tried[0], ...entry }] };
}

describe("parseAutomationStudioTriedRecord", () => {
  it("returns a fresh record", () => {
    const parsed = parseAutomationStudioTriedRecord(VALID);
    expect(parsed).toEqual({ ok: true, record: VALID });
    if (!parsed.ok) throw new Error("expected a valid record");
    expect(parsed.record.tried).not.toBe(VALID.tried);
    expect(parsed.record.tried[1]).not.toBe(VALID.tried[1]);
    expect(parsed.record.tried[1]?.changes).not.toBe(VALID.tried[1]?.changes);
  });

  it("takes an empty record", () => {
    expect(issuesOf({ version: 1, tried: [], approaches: 0 })).toEqual([]);
  });

  it("refuses an unknown version, kind, outcome and pattern", () => {
    expect(issuesOf({ ...VALID, version: 2 })).toEqual(["tried_record.invalid_version"]);
    expect(issuesOf(withEntry({ kind: "thought" }))).toEqual(["tried_record.invalid_kind"]);
    expect(issuesOf(withEntry({ outcome: "worked" }))).toEqual(["tried_record.invalid_outcome"]);
    expect(issuesOf(withEntry({ pattern: "stuck" }))).toEqual(["tried_record.invalid_pattern"]);
  });

  it("carries no text: a key is a digest, and a tool or a change is a code", () => {
    expect(issuesOf(withEntry({ key: "pressed the blue button" }))).toEqual(["tried_record.invalid_key"]);
    expect(issuesOf(withEntry({ toolId: "pressed the blue button" }))).toEqual(["tried_record.invalid_tool_id"]);
    expect(issuesOf(withEntry({ changes: [{ step: 1, change: "made it the blue one" }] }))).toEqual(["tried_record.invalid_changes"]);
    expect(issuesOf(withEntry({ changes: [{ step: 1, change: "replace", text: "x" }] }))).toEqual(["tried_record.invalid_changes"]);
  });

  it("holds nothing it does not name: no address into a page, page text, a model's words or a token", () => {
    for (const key of ["selector", "pageText", "token", "reason", "input", "rows"]) {
      expect(issuesOf({ ...VALID, [key]: "x" }), key).toEqual(["tried_record.unknown_key"]);
      expect(issuesOf(withEntry({ [key]: "x" })), key).toEqual(["tried_record.unknown_key"]);
    }
  });

  it("counts from one, and refuses a count that is not whole", () => {
    expect(issuesOf(withEntry({ times: 0 }))).toEqual(["tried_record.invalid_times"]);
    expect(issuesOf({ ...VALID, approaches: -1 })).toEqual(["tried_record.invalid_approaches"]);
    expect(issuesOf({ ...VALID, tried: "none" })).toEqual(["tried_record.invalid_tried"]);
    expect(issuesOf({ ...VALID, tried: ["none"] })).toEqual(["tried_record.invalid_entry"]);
  });

  it("refuses what is not a record, and never throws", () => {
    for (const value of [null, 1, "tried", []]) expect(issuesOf(value)).toEqual(["tried_record.not_object"]);
    const hostile = { ...VALID, get tried(): string { throw new Error("no"); } };
    expect(issuesOf(hostile)).toEqual(["tried_record.invalid"]);
  });
});
