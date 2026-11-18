import { isSecureOrLoopbackOrigin } from "@fluxiq/contracts/platform";
import { KeySessionError, type KeyBinding } from "../model/index.ts";
import type { KeySessionServiceOptions } from "./options.ts";

export function keySessionConfiguration(options: KeySessionServiceOptions) {
  if (!isSecureOrLoopbackOrigin(options.origin)) throw new TypeError("The key-session origin must be an exact HTTPS origin, or HTTP on loopback.");
  if (typeof options.instanceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(options.instanceId)) throw new TypeError("A stable key-session instance id is required.");
  if (typeof options.eligible !== "function") throw new TypeError("A trusted key eligibility check is required.");
  const lifetimeMs = options.sessionLifetimeMs ?? 3_600_000;
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 900_000 || lifetimeMs > 43_200_000) throw new TypeError("Key sessions must last between fifteen minutes and twelve hours.");
  return {
    audience: `${options.origin}#${options.instanceId}`,
    lifetimeMs,
    time(): number {
      const value = (options.now ?? Date.now)();
      if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + lifetimeMs)) throw new Error("The key-session clock is invalid.");
      return value;
    },
    async requireEligible(binding: KeyBinding): Promise<void> {
      let eligible: boolean;
      try {
        eligible = await options.eligible({ userId: binding.userId, workspaceId: binding.workspaceId });
      } catch {
        throw new KeySessionError("key.unauthorized");
      }
      if (eligible !== true) throw new KeySessionError("key.unauthorized");
    }
  };
}
