import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { InstructionsView, InstructionsViewContent, effectiveInstructionOrder, estimateInstructionTokens, INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS, INSTRUCTION_TEMPLATES, instructionDiagnostics, instructionDraftIsDirty, instructionDraftStorageKey, instructionImportance, instructionPriorityForImportance, instructionScopeTargetError, readInstructionDirectoryUrlState, readStoredInstructionDraft } from "./index";
import { EffectiveInstructionsPanel, InstructionEditorPanel } from "./InstructionWorkbenchPanels";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("Automation Instructions workspace", () => {
  it("restores bounded Instruction filters and renders bottom pagination", () => {
    expect(readInstructionDirectoryUrlState({ search: "checkout", scopeKind: "on_error", status: "active", requirement: "required", sort: "priority", direction: "asc", limit: 50, offset: 100 })).toMatchObject({ search: "checkout", scopeKind: "on_error", status: "active", requirement: "required", sort: "priority", direction: "asc", limit: 50, offset: 100 });
    expect(readInstructionDirectoryUrlState({ limit: 100 }).limit).toBe(25);
    const html = renderToStaticMarkup(createElement(InstructionsView, { projectId: null, flow: { flowId: "flow.checkout" } }));
    expect(html).toContain("Search instructions");
    expect(html).toContain("All scopes");
    expect(html).toContain("All requirements");
    expect(html).toContain("Instructions per page");
    expect(html).toContain("First instruction page");
    expect(html).toContain("Last instruction page");
  });

  it("preserves instruction drafts and guards dirty editor navigation", () => {
    const base = { instructionId: "", title: "", body: "", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow" as const, priority: 50, requirement: "advisory", status: "active" };
    expect(instructionDraftStorageKey("project.one", "flow.checkout", "instruction.refunds")).toBe("fluxiq:instruction-draft:project.one:flow.checkout:instruction.refunds");
    expect(instructionDraftStorageKey("project.one", "flow.checkout")).toBe("fluxiq:instruction-draft:project.one:flow.checkout:new");
    expect(instructionDraftIsDirty(base, base)).toBe(false);
    expect(instructionDraftIsDirty({ ...base, body: "Require an order number." }, base)).toBe(true);

    const viewSource = InstructionsViewContent.toString();
    const editorSource = InstructionEditorPanel.toString();
    expect(viewSource).toContain("saveStoredInstructionDraft");
    expect(viewSource).toContain("useDirtyViewRegistration");
    expect(viewSource).toContain("Unsaved Instruction Changes");
    expect(editorSource).toContain("Recovered local draft");
    expect(editorSource).toContain("automation-instruction-content-section");
    expect(editorSource).toContain("automation-instruction-behavior-section");
  });

  it("removes oversized instruction recovery drafts before parsing", () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    const key = instructionDraftStorageKey("project.one", "flow.checkout");
    const fakeWindow = {
      localStorage: {
        getItem: (storageKey: string) => values.get(storageKey) ?? null,
        setItem: (storageKey: string, value: string) => { values.set(storageKey, value); },
        removeItem: (storageKey: string) => { values.delete(storageKey); }
      }
    } as any;
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    try {
      values.set(key, "{" + " ".repeat(INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS) + "}");
      expect(readStoredInstructionDraft(key)).toBeNull();
      expect(values.has(key)).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
  it("uses named object pickers and validates scoped instruction targets", () => {
    const base = { instructionId: "", title: "Rule", body: "Do the thing", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow" as const, priority: 50, requirement: "advisory", status: "active" };
    expect(instructionScopeTargetError(base)).toBe("");
    expect(instructionScopeTargetError({ ...base, scopeKind: "router" })).toBe("Choose the Flow Router.");
    expect(instructionScopeTargetError({ ...base, scopeKind: "subflow" })).toBe("Choose a subflow.");
    expect(instructionScopeTargetError({ ...base, scopeKind: "node" })).toBe("Choose a node.");
    expect(instructionScopeTargetError({ ...base, scopeKind: "on_error", errorTargetKind: "node" })).toContain("node whose errors");
    const source = InstructionsViewContent.toString();
    expect(source).toContain(".Combobox");
    expect(source).toContain("Search subflows");
    expect(source).toContain("Search nodes");
    expect(source).toContain("All projects and Flows");
    expect(source).toContain("routerId: draftInstruction.routerId");
  });
  it("maps instruction importance and provides practical starter templates", () => {
    expect(instructionPriorityForImportance("low")).toBe(25);
    expect(instructionPriorityForImportance("normal")).toBe(50);
    expect(instructionPriorityForImportance("high")).toBe(75);
    expect(instructionPriorityForImportance("critical")).toBe(90);
    expect(instructionImportance(63)).toBe("custom");
    expect(INSTRUCTION_TEMPLATES.map((template) => template.id)).toEqual(expect.arrayContaining(["flow-goal", "safety-constraint", "error-recovery", "router-guidance", "subflow-rule", "node-guidance", "review-criteria"]));
    const source = InstructionEditorPanel.toString();
    expect(source).toContain("Apply Template");
    expect(source).toContain("Fine-tune priority");
    expect(source).toContain("Required guidance is treated as a runtime constraint");
    expect(source).toContain("aria-pressed");
  });
  it("orders effective instructions like runtime precedence and exposes real inner views", () => {
    const ordered = effectiveInstructionOrder([
      { instructionId: "disabled", status: "disabled", priority: 100, updatedAt: 1, scope: { kind: "global" } },
      { instructionId: "node", status: "active", priority: 90, updatedAt: 1, scope: { kind: "node" } },
      { instructionId: "flow-low", status: "active", priority: 25, updatedAt: 1, scope: { kind: "flow" } },
      { instructionId: "global", status: "active", priority: 50, updatedAt: 1, scope: { kind: "global" } },
      { instructionId: "flow-high", status: "active", priority: 75, updatedAt: 2, scope: { kind: "flow" } }
    ]);
    expect(ordered.map((instruction) => instruction.instructionId)).toEqual(["global", "flow-high", "flow-low", "node"]);
    const html = renderToStaticMarkup(createElement(InstructionsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", nodes: [] } }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Library");
    expect(html).toContain("Editor");
    expect(html).toContain("Effective Preview");
    expect(html).toContain("How the runtime reads this guidance");
    expect(html).toContain("No active instructions apply");
  });
  it("diagnoses conflicts, duplicates, shadowing, and token pressure", () => {
    const scope = { kind: "flow", projectId: "project.one", flowId: "flow.one" };
    const instructions = [
      { instructionId: "high", title: "Safety", body: "Always verify the account. " + "x".repeat(3300), scope, status: "active", requirement: "required", priority: 90 },
      { instructionId: "low", title: "Safety", body: "Never verify the account.", scope, status: "active", requirement: "required", priority: 25 },
      { instructionId: "duplicate-a", title: "First copy", body: "Keep state stable.", scope, status: "active", requirement: "advisory", priority: 50 },
      { instructionId: "duplicate-b", title: "Second copy", body: " keep   state stable. ", scope, status: "active", requirement: "advisory", priority: 50 }
    ];
    const codes = instructionDiagnostics(instructions, 100).map((diagnostic) => diagnostic.code);
    expect(codes).toEqual(expect.arrayContaining(["instruction.conflict", "instruction.duplicate", "instruction.shadowed", "instruction.large", "instruction.token_budget"]));
    expect(estimateInstructionTokens({ title: "1234", body: "5678" })).toBe(2);
    const editorSource = InstructionEditorPanel.toString();
    const effectiveSource = EffectiveInstructionsPanel.toString();
    expect(editorSource).toContain("Draft Checks");
    expect(effectiveSource).toContain("Effective Set Checks");
    expect(editorSource).toContain("Estimated instruction tokens");
    expect(effectiveSource).toContain("Instruction context");
  });
  it("uses in-product authorization, explicit save state, and readiness actions", () => {
    const viewSource = InstructionsViewContent.toString();
    const editorSource = InstructionEditorPanel.toString();
    expect(viewSource).not.toContain("window.prompt");
    expect(viewSource).toContain("Authorize Instruction Save");
    expect(viewSource).toContain("Security PIN");
    expect(editorSource).toContain("Save Instruction");
    expect(editorSource).toContain("Discard Changes");
    expect(viewSource).toContain("commitAutomationStudioMutation");
    const html = renderToStaticMarkup(createElement(InstructionsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", nodes: [] } }));
    expect(html).toContain("This Flow needs guidance before its first run");
    expect(html).toContain("Create Instruction");
    expect(html).toContain("Browse Templates");
    expect(html).toContain("All changes saved");
  });
  it("opens a usable editor from the brand-new Flow readiness action", async () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      clearTimeout: globalThis.clearTimeout,
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => { values.delete(key); },
        setItem: (key: string, value: string) => { values.set(key, value); }
      },
      setTimeout: globalThis.setTimeout
    } });
    const ok = async (payload: Record<string, unknown>) => ({ ok: true as const, payload });
    const commands = {
      loadScopeRouter: vi.fn(() => ok({ router: null })),
      listScopeSubflows: vi.fn(() => ok({ subflows: [] })),
      loadEffectiveSet: vi.fn(() => ok({ instructions: [] })),
      listInstructions: vi.fn(() => ok({ page: { instructions: [], limit: 25, offset: 0, total: 0 } })),
      loadInstruction: vi.fn(() => ok({ instruction: null })),
      saveInstruction: vi.fn(() => ok({ instruction: null }))
    } as any;
    let renderer: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        renderer = create(<InstructionsViewContent commands={commands} flow={{ flowId: "flow.new", name: "New Flow", nodes: [] }} projectId="project.one" />);
      });
      const createInstruction = renderer!.root.findAllByType("button").find((button) => button.children.includes("Create Instruction"));
      expect(createInstruction).toBeDefined();
      expect(renderer!.root.findByProps({ className: "automation-instruction-editor-pane" }).props.hidden).toBe(true);
      await act(async () => createInstruction!.props.onClick());
      expect(renderer!.root.findByProps({ className: "automation-instruction-editor-pane" }).props.hidden).toBe(false);
      expect(renderer!.root.findAllByType("textarea")).toHaveLength(1);
      expect(renderer!.root.findAllByProps({ role: "tab" }).find((tab) => tab.children.includes("Editor"))?.props["aria-selected"]).toBe(true);
    } finally {
      if (renderer) await act(async () => renderer!.unmount());
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
});
