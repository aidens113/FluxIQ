/** Studio's link in one domain, keeping every other query parameter. */
export function studioHref(domainId: string, query: Record<string, string | string[] | undefined>): string {
  const destination = new URLSearchParams({ domainId });
  for (const [key, value] of Object.entries(query)) {
    if (key === "domainId" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) destination.append(key, entry);
  }
  return `/programs/automation-studio?${destination}`;
}
