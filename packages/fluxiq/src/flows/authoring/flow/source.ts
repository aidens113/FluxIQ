/** Controls which authoring surface owns the canonical Flow definition. */
export type AutomationStudioFlowSource =
  | { mode: "visual" }
  | { mode: "code"; moduleId: string; sourceDigest?: string; compiledDigest?: string; compilerVersion?: string; declaredDependencies?: string[] };
