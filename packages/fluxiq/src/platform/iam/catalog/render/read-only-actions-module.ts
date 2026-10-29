import { renderIamActionListModule } from "./action-list-module.ts";

/** Source of `read-only-actions.generated.ts`: the actions needing `programs.read`. */
export function renderReadOnlyActionsModule(actions: readonly string[]): string {
  return renderIamActionListModule("IAM_READ_ONLY_ACTIONS", "renderReadOnlyActionsModule (FLUXIQ_REGENERATE_IAM_CATALOG=1, vitest on src/platform/iam/catalog)", actions);
}
