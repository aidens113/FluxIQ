import { programDomainScope } from "./program-route.ts";

/**
 * The domain a signed-in person's program call works in: the one the URL's
 * `?domainId=` names, or, for an Automation Studio call naming none, the
 * domain the instance's host serves (`FluxIQ.activeDomainId`).
 *
 * A paired client is bound to that same domain when it pairs, so a project or
 * a recording the web panel creates is the domain's, exactly like one the
 * extension creates, and its Flows can use that domain's nodes (a domain-less
 * project's Flows have the global scope, which a domain's nodes refuse). The
 * panel's pages name no domain, which before t915 made everything it created
 * global and invisible to the paired extension (D1/D2). `resolveSetupDomain`
 * once carried the domain on the URL for the same reason, from first-run
 * setup only.
 *
 * Only Automation Studio: projects, their Flows, recordings and chats are its,
 * and its domain gate is what this answers to. Other programs key their own
 * stores by the scope (Database Manager's records, Production Runner's
 * snapshot), and a person reaches their global records there as before.
 */
export function personDomainScope(requestUrl: string, programId: string, instanceDomainId: string | null | undefined): { domainId: string | null } {
  const named = programDomainScope(requestUrl);
  if (named.domainId !== null || programId.trim().toLowerCase() !== "automation-studio") return named;
  return { domainId: instanceDomainId ?? null };
}
