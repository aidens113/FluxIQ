import type { AutomationStudioFlowBootstrapIssueDetail } from "./detail.ts";

export type AutomationStudioFlowBootstrapIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  /**
   * What a domain's refusal named beside its code (t489): the field it could
   * not use and the names it can use there. Identifiers only, screened where
   * the refusal is read (`../../llm/harness-options/plan-parameter-resolution.ts`);
   * the model is told them in Core's own sentence (`./issue-feedback.ts`).
   */
  detail?: AutomationStudioFlowBootstrapIssueDetail;
  /**
   * What to write instead, in Core's own sentence, where the node's own schema
   * says (t514, `../parameter-words/word-instead.ts`): it quotes only the key and
   * word the model wrote, each an identifier, and the line the node takes the
   * word in. The model is told it as the issue's `instead` (`./issue-feedback.ts`).
   */
  instead?: string;
};
