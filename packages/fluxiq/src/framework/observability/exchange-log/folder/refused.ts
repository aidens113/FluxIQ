/**
 * Whether a throw from opening a folder is the disk refusing it -- a full disk,
 * a removed or read-only directory, no number left -- which every such failure
 * names with an errno-style code. That one failure means "no step", never a
 * failed call; anything else is a defect and is rethrown.
 */
export function automationStudioLlmStepLogFolderRefused(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^E[A-Z0-9_]+$/u.test(code);
}
