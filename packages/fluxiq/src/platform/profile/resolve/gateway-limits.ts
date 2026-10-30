import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import type { FluxIQDeploymentSettings } from "../types.ts";
import { parseIntegerSetting } from "./parse-integer-setting.ts";

const LOCAL_LIMITS = { maxFrameBytes: 256 * 1024 * 1024, helloDeadlineMs: null, messagesPerSecond: null, messageBurst: null, pendingPairingsPerAddress: null, pendingPairingsTotal: 1000 };
const HOSTED_LIMITS = { maxFrameBytes: 16 * 1024 * 1024, helloDeadlineMs: 10000, messagesPerSecond: 50, messageBurst: 200, pendingPairingsPerAddress: 5, pendingPairingsTotal: 1000 };

/** The gateway's frame, handshake, rate and pairing limits for a profile, with env overrides. */
export function resolveGatewayLimits(profile: FluxIQProfile, env: Readonly<Record<string, string | undefined>>): FluxIQDeploymentSettings["gateway"]["limits"] {
  const base = profile === "local" ? LOCAL_LIMITS : HOSTED_LIMITS;
  const p = "FLUXIQ_CLIENT_GATEWAY_";
  return {
    maxFrameBytes: parseIntegerSetting(`${p}MAX_FRAME_BYTES`, env[`${p}MAX_FRAME_BYTES`], base.maxFrameBytes, false) as number,
    helloDeadlineMs: parseIntegerSetting(`${p}HELLO_DEADLINE_MS`, env[`${p}HELLO_DEADLINE_MS`], base.helloDeadlineMs, true),
    messagesPerSecond: parseIntegerSetting(`${p}MESSAGES_PER_SECOND`, env[`${p}MESSAGES_PER_SECOND`], base.messagesPerSecond, true),
    messageBurst: parseIntegerSetting(`${p}MESSAGE_BURST`, env[`${p}MESSAGE_BURST`], base.messageBurst, true),
    pendingPairingsPerAddress: parseIntegerSetting(`${p}PENDING_PAIRINGS_PER_ADDRESS`, env[`${p}PENDING_PAIRINGS_PER_ADDRESS`], base.pendingPairingsPerAddress, true),
    pendingPairingsTotal: parseIntegerSetting(`${p}PENDING_PAIRINGS_TOTAL`, env[`${p}PENDING_PAIRINGS_TOTAL`], base.pendingPairingsTotal, false) as number
  };
}
