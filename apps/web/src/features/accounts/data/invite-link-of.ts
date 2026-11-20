/** The invite link an answer carries in `payload.inviteUrl`, when the server returns one; undefined when it does not (the usual case: the link goes only by email). */
export function inviteLinkOf(body: { payload?: unknown } | undefined): string | undefined {
  const payload = body?.payload;
  if (payload === null || typeof payload !== "object") return undefined;
  const url = (payload as { inviteUrl?: unknown }).inviteUrl;
  return typeof url === "string" && url !== "" ? url : undefined;
}
