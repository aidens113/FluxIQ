import type { Permission } from "../../identity-access/index.ts";

/**
 * The permissions a paired client's actor may hold on any call: the approving
 * person's role permissions are intersected with these, whatever the role, so a
 * token never holds `identity.manage`, `data.manage` or `secrets.manage` on a
 * generic call. `flows.write` is here only because the recording proposal and
 * its review, a task's carry-on and Run again, saving a part and a Flow's
 * humanness require it, and the program route narrows each of those so it
 * reaches nothing else of a Flow.
 *
 * The one source for every paired actor (t955): the program route's
 * `pairedClientActor` (`server/program-route/paired-client-actor.ts`), which
 * also serves the panel's app routes and a saved key's use by a trusted client,
 * and the key-access authority's own paired actor
 * (`programs/_shared/key-access/authority.ts`). It lives with the programs
 * because the server may import a program module and no program may import the
 * server. An endpoint that needs one more names it on the program route
 * (`PAIRED_CLIENT_ENDPOINT_PERMISSIONS`), never here.
 */
export const PAIRED_CLIENT_PERMISSIONS: readonly Permission[] = Object.freeze(["programs.read", "programs.write", "runtime.control", "flows.write"]);
