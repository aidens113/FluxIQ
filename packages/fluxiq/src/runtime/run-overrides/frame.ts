// What one run asks Core to do differently from its defaults (W3, t899): the attempts each step
// gets, the waits between them, deadlines, prompt and tool text, the judge's extra criteria, the
// model per role, and the pace. Core's own type: the engine and runtime read it and never import a
// FluxNode word. Every field is optional; an absent one is Core's default. A FluxNode run fills it
// from its resolved overrides (`@fluxiq/contracts/fluxnode`, `resolveFluxNodeOverrides`), which have
// already refused anything that would weaken a safety rule.

/** One text override: appended to the default (joined by a blank line), or replacing it. */
export type AutomationStudioRunTextOverride = { readonly mode: "append" | "replace"; readonly text: string };

export type AutomationStudioRunOverrides = {
  /** Attempts per step, the first included. Read as a floor: never fewer than Core's default (4). */
  readonly nodeAttempts?: number;
  /** Waits between a step's attempts, and the most a step and a run may spend waiting. */
  readonly retryWaits?: { readonly backoffMs?: readonly number[]; readonly perNodeMs?: number; readonly perRunMs?: number };
  readonly deadlines?: {
    readonly llmCallMs?: number;
    readonly judgeMs?: number;
    readonly personWaitMs?: number;
    readonly modelSilence?: { readonly baseMs?: number; readonly capMs?: number };
  };
  /** By prompt section id (`FLUXNODE_PROMPT_SECTIONS`). */
  readonly prompts?: Readonly<Record<string, AutomationStudioRunTextOverride>>;
  /** By tool id; the description only. */
  readonly tools?: Readonly<Record<string, AutomationStudioRunTextOverride>>;
  readonly judgeCriteria?: readonly string[];
  /** A model id per role. */
  readonly models?: { readonly explore?: string; readonly judge?: string; readonly repair?: string };
  /** Read by the engine's pacing (W2): the least gap between two steps. */
  readonly pace?: { readonly minStepGapMs?: number };
  /** The resolved overrides' digest, for the step log and `promptVersion`. */
  readonly digest?: string;
};
