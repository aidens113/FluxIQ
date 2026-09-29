"use client";

import { useMemo } from "react";
import type { SecretKeysSnapshotResponse } from "fluxiq/secret-keys";
import { useProgramApi } from "../../programs/program-api";
import { useClientGatewayPort } from "../clients/client-api";
import type { OnboardingSources } from "./types";

/**
 * The live sources: the client-gateway snapshot the Connected browsers view
 * reads, and the Secret Keys snapshot, which lists key summaries only.
 */
export function useOnboardingSources(): OnboardingSources {
  const gateway = useClientGatewayPort();
  const secretKeys = useProgramApi("secret-keys");
  return useMemo(() => ({
    loadGatewaySnapshot: () => gateway.querySnapshot(),
    loadSecretKeys: () => secretKeys.get<SecretKeysSnapshotResponse>("snapshot")
  }), [gateway, secretKeys]);
}
