/** The folder kind of each model task the step log names for itself. */
const MODEL_KINDS: Readonly<Record<string, string>> = {
  evidence_tool_decision: "decide",
  loop_verification: "judge",
  runtime_diagnosis: "diagnose",
  runtime_patch: "repair",
  flow_bootstrap: "bootstrap"
};

/** The phase a kind stands for when no build scope says otherwise. */
const KIND_PHASES: Readonly<Record<string, string>> = {
  decide: "explore",
  tool: "explore",
  test: "test",
  judge: "judge",
  diagnose: "repair",
  repair: "repair",
  bootstrap: "bootstrap",
  chat: "chat"
};

/**
 * How a step's folder and phase are named. The folder names are a contract the
 * Lab reads (`NNNN-decide`, `NNNN-tool-<toolId>`, `NNNN-test-<toolId>` ...), so
 * a change here is a change to it.
 */
export const automationStudioLlmStepLogNaming = {
  /** `decide`, `judge`, `diagnose`, `repair`, `bootstrap`, or the task kind in kebab case. */
  modelKind(taskKind: string): string {
    return MODEL_KINDS[taskKind] ?? (taskKind.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "model");
  },
  /** A tool id as one folder-name segment: `[A-Za-z0-9._-]` only, `:` and anything else as `_`. */
  toolSegment(toolId: string): string {
    return toolId.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 120) || "unnamed";
  },
  /** A kind's own phase: `judge` for a verdict, `repair` for a diagnosis or patch, `chat` for the panel. */
  phaseOfKind(kind: string): string {
    return KIND_PHASES[kind] ?? kind;
  }
};
