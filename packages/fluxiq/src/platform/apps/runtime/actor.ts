import type { AppAuthorityActor } from "../model/index.ts";
import { AppRegistryServiceError } from "./service-error.ts";

export function requireAppActor(value: AppAuthorityActor | null, now: number, expected?: AppAuthorityActor): AppAuthorityActor {
  if (!value || typeof value.userId !== "string" || !value.userId || typeof value.workspaceId !== "string" || !value.workspaceId || !Number.isFinite(value.expiresAtMs) || value.expiresAtMs <= now || expected && (value.userId !== expected.userId || value.workspaceId !== expected.workspaceId)) throw new AppRegistryServiceError("forbidden");
  return { userId: value.userId, workspaceId: value.workspaceId, expiresAtMs: value.expiresAtMs };
}
