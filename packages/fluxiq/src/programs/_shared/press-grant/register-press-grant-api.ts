import type { GlobalProgramApiRegistry } from "../api.ts";
import { endpointResource } from "../iam/index.ts";
import { PRESS_GRANT_MINT_ENDPOINT } from "./mint-endpoint.ts";

/**
 * Registers the endpoint a panel page calls when the person presses its
 * Delete or Allow button (`PRESS_GRANT_MINT_ENDPOINT`).
 *
 * - `program-gated`: the registry adds no PIN, and the handler runs its own
 *   check (`GlobalProgramApiRegistry.mintPressGrant`): a person on their own
 *   panel session, never the assistant, a paired client or a key, and only
 *   for a destructive endpoint IAM lets them call on that payload. Being
 *   neither `read` nor `authoring`, it is also out of reach of a paired
 *   client's token and of a chat command, which reach only those classes.
 * - `programs.read`: every person holds it. The real gate is the target
 *   endpoint's own decision, made when minting and again when the call runs.
 * - Hidden from the assistant: a grant the assistant could obtain would let
 *   it approve its own act.
 */
export function registerPressGrantApi(registry: GlobalProgramApiRegistry): void {
  registry.register({
    ...PRESS_GRANT_MINT_ENDPOINT,
    permission: "programs.read",
    classification: "program-gated",
    action: "iam:MintPressGrant",
    accessLevel: "Write",
    resource: endpointResource.selfUser(),
    assistant: { hidden: "Only a person's own press can confirm an action." },
    handler: async (request) => {
      const body = request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? (request.payload as Record<string, unknown>) : {};
      const { programId, endpoint, payload } = body;
      if (typeof programId !== "string" || typeof endpoint !== "string") return { ok: false, error: "Name the action this press confirms." };
      if (payload !== undefined && (payload === null || typeof payload !== "object" || Array.isArray(payload))) return { ok: false, error: "The action's details must be an object." };
      // A page's mint is always a press: nothing in the body can say the person's words asked.
      return registry.mintPressGrant({ actor: request.actor, via: request.via, consent: "press", scope: request.scope, programId, endpoint, payload });
    }
  });
}
