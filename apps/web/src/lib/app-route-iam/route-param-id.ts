/**
 * A route param as the id a resource names: URI-decoded, or as sent when it
 * does not decode. Never throws, so a malformed param reaches the decision
 * (as an id no one owns) rather than failing before it.
 */
export function routeParamId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
