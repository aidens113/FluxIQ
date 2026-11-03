import type { ProjectArtifactKind } from "../../../framework/persistence/contracts/index.ts";

/** `task`, `routine`, and owner-bound `flow` are legacy compatibility kinds. New executable work uses canonical Flow APIs. */
export type AutomationStudioProjectArtifactKind = ProjectArtifactKind;

