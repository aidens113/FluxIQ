// A FluxNode's scope is its standing grant (plan, N6): the sites or apps it may use
// and the classes of lasting act it may take, given before the run starts so nothing
// asks mid-run. Reading is always allowed. An act outside the scope is refused and the
// run looks for another way within its budget.

import { z } from "zod";

/**
 * The classes of lasting act a scope may grant: changing something, sending
 * something to someone, moving money, and deleting. Reading needs no grant.
 */
export const FLUXNODE_ACT_CLASSES = Object.freeze(["change", "send", "money", "delete"] as const);

export type FluxNodeActClass = (typeof FLUXNODE_ACT_CLASSES)[number];

const SITE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::[0-9]{1,5})?$/u;
const APP = /^[A-Za-z0-9](?:[A-Za-z0-9._+ -]{0,126}[A-Za-z0-9])?$/u;

const siteSchema = z
  .string()
  .transform((site) => site.toLowerCase())
  .refine((site) => site.length <= 253 && SITE.test(site), 'A site is a host name, optionally with a port, such as "market.example" or "localhost:3000"; no scheme or path.');

const appSchema = z.string().regex(APP, 'An app is its id or name, such as "com.example.messages" or "notepad.exe": 1 to 128 of letters, digits, ".", "_", "+", "-" and spaces.');

const actSchema = z.enum(["read", ...FLUXNODE_ACT_CLASSES]);

/**
 * - `sites`: host names the run may use; each covers itself and its subdomains, and
 *   a port, when given, must match. Absent: no restriction by site.
 * - `apps`: app ids or names the run may use. Absent: no restriction by app.
 * - `acts`: the lasting acts granted. Empty grants none, so the run may only read.
 *   `"read"` is accepted and dropped, since reading is always allowed.
 *
 * Sites are lowercased; each list loses repeats.
 */
export const fluxNodeScopeSchema = z
  .object({
    sites: z.array(siteSchema).max(64).optional(),
    apps: z.array(appSchema).max(64).optional(),
    acts: z.array(actSchema).max(8)
  })
  .strict()
  .transform((scope) => {
    const normalized: { sites?: string[]; apps?: string[]; acts: FluxNodeActClass[] } = {
      acts: [...new Set(scope.acts)].filter((act): act is FluxNodeActClass => act !== "read")
    };
    if (scope.sites !== undefined) normalized.sites = [...new Set(scope.sites)];
    if (scope.apps !== undefined) normalized.apps = [...new Set(scope.apps)];
    return normalized;
  });

export type FluxNodeScope = z.infer<typeof fluxNodeScopeSchema>;

/**
 * True when the scope lets a run use `host` (a host name, optionally with a port).
 * A site entry covers itself and its subdomains; an entry with a port matches only
 * that port.
 */
export function fluxNodeScopeAllowsSite(scope: FluxNodeScope, host: string): boolean {
  if (scope.sites === undefined) return true;
  const [name = "", port] = host.toLowerCase().split(":");
  return scope.sites.some((site) => {
    const [siteName = "", sitePort] = site.split(":");
    if (sitePort !== undefined && sitePort !== port) return false;
    return name === siteName || name.endsWith(`.${siteName}`);
  });
}
