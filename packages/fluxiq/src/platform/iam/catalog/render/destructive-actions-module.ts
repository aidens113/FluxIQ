import { renderIamActionListModule } from "./action-list-module.ts";

/** Source of `destructive-actions.generated.ts`: the destructive and destructive-ungated actions. */
export function renderDestructiveActionsModule(actions: readonly string[]): string {
  return renderIamActionListModule("IAM_DESTRUCTIVE_ACTIONS", "renderDestructiveActionsModule (FLUXIQ_REGENERATE_IAM_CATALOG=1, vitest on src/platform/iam/catalog)", actions);
}
