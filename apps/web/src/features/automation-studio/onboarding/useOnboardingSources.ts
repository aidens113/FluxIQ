"use client";

import { useMemo } from "react";
import type { SecretKeysSnapshotResponse } from "fluxiq/secret-keys";
import { useProgramApi } from "../../programs/program-api";
import { useClientGatewayPort } from "../clients/client-api";
import { loadOnboardingGatewaySnapshot } from "./gateway-snapshot";
import type { OnboardingSources } from "./types";

/**
 * The live sources: the client-gateway snapshot composed with its sessions and
 * pairings lists, as the Connected browsers view reads them, and the Secret
 * Keys snapshot, which lists key summaries only.
 */
export function useOnboardingSources(): OnboardingSources {
  const gateway = useClientGatewayPort();
  const secretKeys = useProgramApi("secret-keys");
  return useMemo(() => ({
    loadGatewaySnapshot: () => loadOnboardingGatewaySnapshot(gateway),
    loadSecretKeys: () => secretKeys.get<SecretKeysSnapshotResponse>("snapshot")
  }), [gateway, secretKeys]);
}
