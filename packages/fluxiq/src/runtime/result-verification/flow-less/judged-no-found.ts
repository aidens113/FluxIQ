// What a no found wrong, carried to the model that goes on after it (t1011).
//
// **Why.** Run `run-mwug2xjw-41f62603` (0116-0131): the model gave its best result through
// `finish_with_best`; the check said no and listed exactly what was wrong -- kept rows priced over
// the limit the request set, a column the request asks about that no row held -- but the model was
// shown only the check's prose (what it saw, what was asked, what changed), whose last clause was a
// remark about paging. The list was dropped where the no became words (`./judge.ts`,
// `readingWords`), and so was Core's own check of the rows it named (`checked`,
// `../request-rows/checked-rows.ts`), which the repair of a Flow has always been given. The model went
// back to looking for a next page it had already looked for, never to the rows the check named.
//
// So a no's defects, as screened (`../verdict/defects.ts`) and marked as the check's own words
// wherever they are shown, go to the model beside Core's lines on the rows they name. Core's fix
// lines stay with a Flow's repair: they speak of a Flow's steps and record output, which an attempt
// with no Flow does not have. Nothing here changes the verdict or what a person is told: `reason`
// stays as it was.

import type { AutomationStudioResultRepairDirective } from "../contracts/index.ts";
import type { AutomationStudioFlowLessFound } from "./types.ts";

export function automationStudioFlowLessJudgedNoFound(repair: AutomationStudioResultRepairDirective | undefined): AutomationStudioFlowLessFound | undefined {
  const defects = repair?.judgement?.defects ?? [];
  const checkedRows = repair?.checked ?? [];
  if (!defects.length && !checkedRows.length) return undefined;
  return {
    ...(defects.length ? { defects: defects.map((defect) => ({ ...defect })) } : {}),
    ...(checkedRows.length ? { checkedRows: [...checkedRows] } : {})
  };
}
