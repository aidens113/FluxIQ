// Whether this deployment can generate a Flow at all, answered from what the
// service happens to be holding.
//
// Three independent things have to be true before a build can start, and each
// one is missing in a different deployment: a provider resolver, a node
// registry with a control foundation and at least one executable node, and the
// evidence tools an evidence-guided build runs. A caller asks once and is told
// which of the three is absent, rather than starting a build to find out.
//
// It reads state and derives an answer, which is the shape of a function rather
// than of a method: it lives here so `runtime/service.ts` keeps the build and
// not the inventory.

/** What a deployment has to have before a build may start. */
export type AutomationStudioFlowBootstrapGenerationReadiness = {
  providerResolverConfigured: boolean;
  nativeNodeRegistryConfigured: boolean;
  /** Whether a host bound the evidence tools that evidence-guided generation needs, and how many. */
  llmEvidenceRuntime: { bound: boolean; toolCount: number };
  /**
   * Candidate authoring can test a submitted candidate (t340): `runner` is true
   * in every Core that has the trial runner, and `startReset` says whether the
   * deployment set the start hook (D1) that resets the target before each trial.
   * The Lab checks it before it starts a candidate-mode creation (U4).
   */
  candidateTrial: { runner: true; startReset: boolean };
};

/** The two nodes a registry must hold before anything it holds can be wired into a Flow. */
const CONTROL_FOUNDATION = ["builtin.control.start", "builtin.control.end"] as const;

/** Read the three readiness answers off the runtime a service was built with. */
export function automationStudioFlowBootstrapGenerationReadiness(input: {
  nativeNodeRuntime?: {
    sdk: { nodes: { get(definitionId: string): unknown } };
    listDefinitions(): readonly { id: string; capabilities: { executable?: boolean } }[];
  } | undefined;
  providerResolverConfigured: boolean;
  llmEvidenceRuntime?: { tools: readonly unknown[] } | undefined;
  /** Whether the deployment set `prepareCandidateStart`. */
  candidateStartPrepared?: boolean | undefined;
}): AutomationStudioFlowBootstrapGenerationReadiness {
  const native = input.nativeNodeRuntime;
  const hasControlFoundation = CONTROL_FOUNDATION.every((definitionId) => Boolean(native?.sdk.nodes.get(definitionId)));
  const hasExecutableDomainNode = (native?.listDefinitions() ?? [])
    .some((definition) => !(CONTROL_FOUNDATION as readonly string[]).includes(definition.id) && definition.capabilities.executable === true);
  return {
    providerResolverConfigured: input.providerResolverConfigured,
    nativeNodeRegistryConfigured: hasControlFoundation && hasExecutableDomainNode,
    llmEvidenceRuntime: { bound: input.llmEvidenceRuntime !== undefined, toolCount: input.llmEvidenceRuntime?.tools.length ?? 0 },
    candidateTrial: { runner: true, startReset: input.candidateStartPrepared === true }
  };
}
