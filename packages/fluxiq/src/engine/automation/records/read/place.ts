// Where in its list a read's answer says it read, so a record batch can say which page of the list its rows were.
//
// A domain's answer holds the place its pager said beside the rows, as a `place`: one `name=value` string
// (`page=3`, `offset=40`, `cursor=abc`), as the same names a page address says them
// (`framework/automation-service/service/answer-first/rows/address-split.ts`, which reads them off the
// address only until a domain's answer carries them). Core reads that one name on the same objects as the
// listing's key and the address (`./holders.ts`), the nearer first, and takes only a string that is a whole
// place of that shape. A pager that said nothing leaves no place, and none is made from the rows or the
// address here.
import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioRecordReadHolders } from "./holders.ts";

/** One or more `name=value` parts joined by `&`: names are words, values are tokens a pager says, and nothing else rides on it. */
const PLACE_PATTERN = /^[a-z][a-z0-9_-]{0,31}=[A-Za-z0-9_.~-]{1,128}(?:&[a-z][a-z0-9_-]{0,31}=[A-Za-z0-9_.~-]{1,128}){0,3}$/u;

export function automationStudioRecordReadPlace(answer: JsonValue | undefined, recordsPath: readonly string[]): string | undefined {
  for (const holder of automationStudioRecordReadHolders(answer, recordsPath)) {
    const said = holder.place;
    if (typeof said === "string" && PLACE_PATTERN.test(said)) return said;
  }
  return undefined;
}
