import type { ModelKeyAvailability } from "fluxiq/ui";

/** An answer that may be refused: the person lacks access to it, or the data is here. */
export type Guarded<T> = { state: "denied" } | { state: "ready"; data: T };

/** One model-provider key as the screen shows it. It never carries the key's value. */
export type KeyRow = {
  id: string;
  name: string;
  provider: string;
  addedAt: number | undefined;
  lastRevealedAt: number | undefined;
  enabled: boolean;
  /** Saved-key availability says nothing about client authentication or provider health. */
  availability: ModelKeyAvailability | { state: "unknown" } | { state: "unavailable"; code: "upgrade_required" };
};

export type SessionRow = { digest: string; expiresAt: number | undefined };

export type PersonRow = {
  id: string;
  name: string;
  username: string;
  roleId: string;
  permissions: string[];
  enabled: boolean;
  sessions: SessionRow[];
};

/** `otherSessions` are sessions of an account the snapshot does not list. */
export type AccessRows = { people: PersonRow[]; otherSessions: SessionRow[] };

export type PairedClientRow = {
  trustedClientId: string;
  name: string;
  clientType: string;
  status: string;
  approvedAt: number | undefined;
  lastUsedAt: number | undefined;
};
