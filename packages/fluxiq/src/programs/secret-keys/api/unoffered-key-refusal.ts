import type { SecretKeysService } from "../runtime/service.ts";

/**
 * Why `chooserId` may not choose `keyId` for the workspace (as its default or
 * its assistant's key), or undefined when they may: another person's key is
 * chosen only once its holder offered it to the workspace. A key the chooser
 * added, or one nobody is stamped on, needs no offer. Both choosing endpoints
 * ask this, so the rule cannot differ between them.
 */
export async function unofferedKeyRefusal(service: SecretKeysService, keyId: string, chooserId: string | undefined): Promise<string | undefined> {
  if (chooserId === undefined) return undefined;
  const holder = (await service.getKeySummary(keyId))?.createdBy;
  if (holder === undefined || holder === chooserId) return undefined;
  if (await service.modelKeys.offeredById(keyId)) return undefined;
  return "That key belongs to someone else, who has not offered it to this workspace.";
}
