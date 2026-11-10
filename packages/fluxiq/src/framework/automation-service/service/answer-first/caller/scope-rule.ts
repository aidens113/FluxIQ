// What a caller's scope (`AutomationStudioAnswerFirstCallerScope`; fluxnode-plan N6) allows, read the
// same way at every door it is held at: the model's own calls (`./scope-gate.ts`), a saved Flow's
// run (`./replay-scope.ts`) and where the attempt starts (`./held.ts`).
//
// **Its classes.** Each class of lasting act is granted by name, a change included; a word that is
// no class is nobody's to grant and is left to the permission gate, which reads it fail-closed.
//
// **Its sites.** Only an absolute http(s) address is a site, so a domain whose places are not web
// addresses is unaffected (Core never parses a domain's own spellings,
// `runtime/flow-bootstrap/start-location.ts`). A site covers itself and its subdomains, with a port
// only where given: the FluxNode scope's own rule (`fluxNodeScopeAllowsSite`), so the two cannot
// disagree. A scope that names no sites allows every one.

import { fluxNodeScopeAllowsSite } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";
import { isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioAnswerFirstCallerScope } from "../../flow-bootstrap-commands/index.ts";

/** How deep into a value addresses are looked for, and how many strings at most: a call's value is small, and this bounds a strange one. */
const MOST_DEPTH = 6;
const MOST_STRINGS = 400;

export type AutomationStudioAnswerFirstScopeRule = {
  /** The classes among `classes` the scope does not grant. */
  notGranted(classes: readonly unknown[]): AutomationStudioActionConsequence[];
  /** Whether the scope names its sites, so that addresses are held to them. */
  bySite: boolean;
  allowed(host: string): boolean;
  /** The host of an absolute http(s) address, or none for any other text. */
  hostOf(text: string): string | undefined;
  /** The host of every absolute http(s) address in a value. */
  hostsIn(value: JsonValue): string[];
  /** The sites, said in words: "none" for an empty list. */
  listed: string;
};

export function automationStudioAnswerFirstScopeRule(scope: AutomationStudioAnswerFirstCallerScope): AutomationStudioAnswerFirstScopeRule {
  const granted = new Set<string>(scope.permittedConsequences);
  const sites = scope.sites === undefined ? undefined : { acts: [], sites: [...scope.sites] };
  return {
    notGranted: (classes) => classes.filter((each): each is AutomationStudioActionConsequence => isAutomationStudioActionConsequence(each) && !granted.has(each)),
    bySite: sites !== undefined,
    allowed: (host) => sites === undefined || fluxNodeScopeAllowsSite(sites, host),
    hostOf,
    hostsIn,
    listed: scope.sites?.length ? scope.sites.join(", ") : "none"
  };
}

function hostsIn(value: JsonValue): string[] {
  const hosts = new Set<string>();
  let seen = 0;
  const visit = (node: JsonValue, depth: number): void => {
    if (seen >= MOST_STRINGS || depth > MOST_DEPTH) return;
    if (typeof node === "string") {
      seen += 1;
      const host = hostOf(node);
      if (host !== undefined) hosts.add(host);
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
    } else if (node !== null && typeof node === "object") {
      for (const item of Object.values(node)) visit(item, depth + 1);
    }
  };
  visit(value, 0);
  return [...hosts];
}

function hostOf(text: string): string | undefined {
  const trimmed = text.trim();
  if (!/^https?:\/\//iu.test(trimmed) || !URL.canParse(trimmed)) return undefined;
  const host = new URL(trimmed).host.toLowerCase();
  return host.length ? host : undefined;
}
