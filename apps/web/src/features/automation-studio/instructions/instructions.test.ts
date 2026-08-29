import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveInstructionOrder, instructionDiagnostics, instructionScopeTargetError } from "./instruction-model";
import { InstructionsViewContent } from "./InstructionsView";
import { INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS, instructionDraftStorageKey, readStoredInstructionDraft, removeStoredInstructionDraft, saveStoredInstructionDraft } from "./instruction-draft-repository";

describe("instruction domain", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("orders effective guidance and validates scoped targets", () => {
    expect(effectiveInstructionOrder([
      { instructionId: "low", priority: 1, status: "active", scope: { kind: "flow" } },
      { instructionId: "high", priority: 10, status: "active", scope: { kind: "flow" } }
    ])[0].instructionId).toBe("high");
    expect(instructionScopeTargetError({ scopeKind: "subflow", subflowId: "" } as any)).toContain("subflow");
    expect(instructionDiagnostics([{ instructionId: "large", body: "x".repeat(9_000), status: "active" }]).length).toBeGreaterThan(0);
  });

  it("encapsulates bounded browser draft persistence", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    });
    const key = instructionDraftStorageKey("p", "f", "i");
    const draft = { instructionId: "i", title: "Title", body: "Body", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow", priority: 1, requirement: "advisory", status: "active" } as const;
    saveStoredInstructionDraft(key, draft);
    expect(readStoredInstructionDraft(key)).toEqual(draft);
    expect(INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS).toBeGreaterThan(1000);
    expect(InstructionsViewContent.toString()).toContain("commitAutomationStudioMutation");
    expect(InstructionsViewContent.toString()).toContain("commands.saveInstruction");
    removeStoredInstructionDraft(key);
    expect(readStoredInstructionDraft(key)).toBeNull();
  });
});