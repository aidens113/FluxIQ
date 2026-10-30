import type { AppRouteActor } from "./types";

type PanelAuth = {
  session: { id: string };
  user: { id: string };
  role: { id: string; permissions: AppRouteActor["permissions"] };
};

/** The actor of a signed-in person's cookie call: their user and role, on the `panel` channel. */
export function panelRouteActor(auth: PanelAuth): AppRouteActor {
  return { sessionId: auth.session.id, userId: auth.user.id, roleId: auth.role.id, permissions: [...auth.role.permissions], channel: "panel" };
}
