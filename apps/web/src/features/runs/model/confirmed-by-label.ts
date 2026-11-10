/** What confirmed a result, in words, or undefined when the run did not say. */
export function confirmedByLabel(by: string | undefined): string | undefined {
  switch (by) {
    case "type": return "confirmed by the result's type";
    case "check": return "confirmed by your check";
    case "judge": return "confirmed by the judge";
    default: return undefined;
  }
}
