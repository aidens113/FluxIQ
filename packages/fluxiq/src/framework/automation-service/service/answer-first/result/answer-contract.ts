// The answer contract (I5): the columns the request names, in its order, read once by the one reader of the person's
// words (`runtime/flow-authoring/bootstrap/answerability/instruction-columns.ts`), and whether that reader was sure.
//
// The reader is unsure where the list's closing item ran on past a name (its `cutShort`): it then names the columns
// read before that item and offers the item's leading words, which may be one more column. An unsure contract is
// stated as unsure and never narrows the answer (`./answer.ts`), and the judge is not given it (run-mwblz4aq-0baa810a,
// where a contract read wrong would have refused the right rows). A request that names no column has a sure, empty
// contract: every column the read keeps is the answer's.
import { automationStudioFlowBootstrapInstructionColumns } from "../../../../../runtime/flow-authoring/bootstrap/answerability/index.ts";
import type { AutomationStudioAnswerFirstAnswerContract } from "./types.ts";

export function automationStudioAnswerFirstAnswerContractOf(instruction: string): AutomationStudioAnswerFirstAnswerContract {
  const named = automationStudioFlowBootstrapInstructionColumns(instruction);
  if (named.cutShort) return { columns: [...named.cutShort.named], sure: false, maybe: [...named.cutShort.leading] };
  return { columns: [...named], sure: true, maybe: [] };
}
