import type { OutputTargetPreparer } from "./index.ts";

/** Original trusted domain invocation identity, without execution authority. */
export type OutputTargetPreparerBinding = {
  readonly receiver: object | undefined;
  readonly callback: OutputTargetPreparer;
};
