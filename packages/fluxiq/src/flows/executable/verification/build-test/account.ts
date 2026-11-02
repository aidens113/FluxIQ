import type { BuildTestInput } from "./input.ts";
import type { BuildTestNote } from "./note.ts";
import type { BuildTestStep } from "./step.ts";
import type { BuildTestStore } from "./store.ts";
import type { JsonObject } from "@fluxiq/contracts/core";

/** A build's test, as its judge reads it: every proposed step in order, and the build's own reading of the instruction's acts. */

export type BuildTestAccount = {
  kind: "build_test";
  /** `reused` when the test's answer was an earlier clean replay of the same Flow; `not_run` when no test applied to this Flow. */
  test: "ran" | "reused" | "not_run";
  steps: BuildTestStep[];
  /** The build's checklist of the instruction's acts. Information, not proof. */
  checklist?: JsonObject[];
  /** What the build's own check found missing. Information, not proof. */
  missingActs?: JsonObject;
  /** What Core's capability checks found the accepted Flow cannot do. Information, not a refusal. */
  notes?: BuildTestNote[];
  /** The Flow's inputs at the values the test ran on, once for the whole test. */
  inputs?: BuildTestInput[];
  /**
   * What the Flow would store, as this test's reads filled it: one entry per
   * dataset it writes, in Flow order (`build-test/stores.ts`). The answer the
   * Flow gives, though the test itself stored nothing. Empty when no step of
   * the Flow stores; absent when the test did not run or the Flow's nodes were
   * not known.
   */
  stores?: BuildTestStore[];
};
