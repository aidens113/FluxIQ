import type { JsonValue } from "../../../../core/index.ts";

/**
 * Where a domain's value lives: one Flow, and within it one build or none.
 * `buildId` absent means flow-scoped -- a value that outlives one build into
 * later builds and runs of the same Flow. Present, it is the evidence build
 * scope's `buildId` (`../llm/harness-options/evidence-build-scope.ts`): the
 * build record's id, or the run's for a recovery exploration.
 */
export type AutomationStudioDomainBuildStateScope = {
  readonly projectId: string;
  readonly flowId: string;
  readonly buildId?: string;
};

/**
 * The durable values one registered domain keeps per build or per Flow
 * (`./accessor.ts`). Each value is opaque JSON Core never reads or logs,
 * bounded in bytes, under a key bounded in count per scope. Every read and
 * write is async and refuses with `AutomationStudioDomainBuildStateRefusal`.
 */
export type AutomationStudioDomainBuildState = {
  readonly domainId: string;
  /** The value under `key`, or undefined when none was put or it was dropped. A copy: changing it changes nothing stored. */
  get(scope: AutomationStudioDomainBuildStateScope, key: string): Promise<JsonValue | undefined>;
  /** Stores `value` under `key`, replacing any earlier one. */
  put(scope: AutomationStudioDomainBuildStateScope, key: string, value: JsonValue): Promise<void>;
  /** Removes the value under `key`; whether there was one. */
  drop(scope: AutomationStudioDomainBuildStateScope, key: string): Promise<boolean>;
};
