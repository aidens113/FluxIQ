import { automationStudioComparableInstructionText as comparable } from "./quote/index.ts";

export /** Whether two quotes are one clause: either contains the other, compared as `comparable` reads them. */
function overlaps(left: string, right: string): boolean {
  const a = comparable(left);
  const b = comparable(right);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}
