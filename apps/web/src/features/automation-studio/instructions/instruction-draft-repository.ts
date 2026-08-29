import type { InstructionDraft } from "./instruction-model";

export const INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS = 250_000;

export function instructionDraftStorageKey(projectId: string, flowId: string, instructionId?: string): string {
  return ["fluxiq", "instruction-draft", projectId, flowId, instructionId ?? "new"].join(":");
}

export function readStoredInstructionDraft(key: string): InstructionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    if (raw.length > INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return JSON.parse(raw) as InstructionDraft;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function saveStoredInstructionDraft(key: string, draft: InstructionDraft): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(draft);
    if (raw.length > INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, raw);
  } catch {
    window.localStorage.removeItem(key);
  }
}

export function removeStoredInstructionDraft(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
