import { z } from "zod";
import { FLUXIQ_REQUEST_ORIGINS } from "../../iam/index.ts";
import { isSessionReference } from "../session/index.ts";

const identifier = z.string().min(1).max(128);

/**
 * Who and what an action command serves (gateway 0.2, `runContext` on every
 * `server.execute_action`), so a client can check the work is its own user's
 * before acting:
 *
 * - `runId`: the run or build the command belongs to;
 * - `actorUserId`, `workspaceId`: the user it runs as and their workspace; a
 *   client refuses a command whose actor is not the user it is connected as;
 * - `origin`: where the work was started (`FLUXIQ_REQUEST_ORIGINS`);
 * - `startedFromSessionId`: the session the work started from, as a panel
 *   session digest or `client-gateway:<gateway session id>`
 *   (`isSessionReference`), never a raw session id; absent for work no session
 *   started (a schedule, the command line). For audit and correlation only.
 *
 * Fields a client does not know are dropped, so a later additive field never
 * breaks it.
 */
export const clientGatewayRunContextSchema = z.object({
  runId: identifier,
  actorUserId: identifier,
  workspaceId: identifier,
  origin: z.enum(FLUXIQ_REQUEST_ORIGINS),
  startedFromSessionId: z.string().refine(isSessionReference, "a session digest or client-gateway:<id>").optional()
});

export type ClientGatewayRunContext = z.infer<typeof clientGatewayRunContextSchema>;

/** Parses an untrusted `runContext`, or returns null. */
export function parseClientGatewayRunContext(value: unknown): ClientGatewayRunContext | null {
  const parsed = clientGatewayRunContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
