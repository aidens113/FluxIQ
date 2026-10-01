// Each Flow's latest failed build, as its request answered it, for a reader
// that started the build some other way and so never saw that answer.
//
// A build the chat starts runs through the same request as any other
// (`../../../api/handlers/llm-generation.ts`), but the chat tells the person in words, and the
// diagnostic -- with what the build spent -- went nowhere a reader could
// count it. Kept per Flow until a later build of it succeeds, and only for the
// most recent Flows, because what is kept is what one build reported.

/** How many Flows' latest failures are kept at once. */
const KEPT = 64;

/** The latest failed build of each recent Flow. */
export type AutomationStudioFlowBootstrapFailedBuilds<Diagnostic> = {
  /** A build of this Flow ended: with this diagnostic when it failed, or `undefined` when it did not, which clears the Flow's last failure. */
  ended(projectId: string, flowId: string, diagnostic: Diagnostic | undefined): void;
  /** The Flow's latest failed build, or undefined when its latest build did not fail or is not kept. */
  latest(projectId: string, flowId: string): Diagnostic | undefined;
};

export function automationStudioFlowBootstrapFailedBuilds<Diagnostic>(): AutomationStudioFlowBootstrapFailedBuilds<Diagnostic> {
  const kept = new Map<string, Diagnostic>();
  const key = (projectId: string, flowId: string): string => `${projectId}\u0000${flowId}`;
  return {
    ended(projectId, flowId, diagnostic) {
      const at = key(projectId, flowId);
      kept.delete(at);
      if (diagnostic === undefined) return;
      kept.set(at, diagnostic);
      while (kept.size > KEPT) kept.delete(kept.keys().next().value!);
    },
    latest(projectId, flowId) {
      return kept.get(key(projectId, flowId));
    }
  };
}
