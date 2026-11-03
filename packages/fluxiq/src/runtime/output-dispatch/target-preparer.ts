import type { DomainOutputDefinition } from "../../domains/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
import type { OutputTargetPreparation } from "./target-preparation.ts";

/** Trusted synchronous domain adaptation, without IO or dispatch capabilities. */
export type OutputTargetPreparer = (input: {
  action: Readonly<RegisteredOutputAction>;
  domainId: string | null;
  output: Readonly<DomainOutputDefinition>;
}) => OutputTargetPreparation;
