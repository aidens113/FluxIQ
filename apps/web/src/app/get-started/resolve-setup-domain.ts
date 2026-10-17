/** An installed domain, as the setup page needs it. */
export type SetupDomain = { id: string; title: string; description: string };

/**
 * Which domain first-run setup works in. A project created from setup is
 * stamped with the domain its Studio request names, and a paired client
 * refuses a project outside the domain it was paired for, so setup must
 * never fall through to a domain-less Studio while a domain is installed.
 * A requested domain is kept when installed; otherwise the runtime's active
 * domain, then the only installed one, is carried. With several installed and
 * none active the person chooses; with none installed setup stays global.
 */
export function resolveSetupDomain(input: { requestedDomainId: string | null; activeDomainId: string | null; domains: readonly SetupDomain[] }):
  | { kind: "scoped"; domainId: string; redirect: boolean }
  | { kind: "choose"; domains: SetupDomain[] }
  | { kind: "global" } {
  const installed = (id: string | null) => id ? input.domains.find((domain) => domain.id === id) ?? null : null;
  const requested = installed(input.requestedDomainId);
  if (requested) return { kind: "scoped", domainId: requested.id, redirect: false };
  const carried = installed(input.activeDomainId) ?? (input.domains.length === 1 ? input.domains[0]! : null);
  if (carried) return { kind: "scoped", domainId: carried.id, redirect: true };
  if (input.domains.length > 1) return { kind: "choose", domains: [...input.domains] };
  return { kind: "global" };
}
