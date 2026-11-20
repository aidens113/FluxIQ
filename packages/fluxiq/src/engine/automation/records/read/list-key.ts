// Which list a read's answer says it read, so a record batch can say which list its rows came from.
//
// A domain's answer to a read holds the list it read beside the rows, as a `listKey`: a string the domain
// made from the site's structure (the list's item selector, container and frame), never from a handle, a
// call or its rows (invariant I3). Core reads that one name, in the answer and in the object the rows' path
// runs through (`./holders.ts`, the nearer first), and treats the key as opaque: it is compared for
// equality and nothing else. No key is no list identity, and the batch then carries none.
import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioRecordReadHolders } from "./holders.ts";

/** The longest key taken: a digest is far shorter, and a longer string is not one. */
const MAX_LIST_KEY_LENGTH = 200;

export function automationStudioRecordReadListKey(answer: JsonValue | undefined, recordsPath: readonly string[]): string | undefined {
  for (const holder of automationStudioRecordReadHolders(answer, recordsPath)) {
    const said = holder.listKey;
    if (typeof said === "string" && said !== "" && said.length <= MAX_LIST_KEY_LENGTH) return said;
  }
  return undefined;
}
