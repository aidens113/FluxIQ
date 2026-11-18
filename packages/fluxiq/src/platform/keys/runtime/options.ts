import type { KeyBinding, KeyStore } from "../model/index.ts";

export type KeySessionServiceOptions = {
  store: KeyStore;
  /** Exact configured URL.origin. Never derive this from a request's Host or forwarded headers. */
  origin: string;
  /** Stable deployment identity, shared with discovery and retained across restarts. */
  instanceId: string;
  /** Trusted account-enabled AND active-workspace-membership check. Required at issuance and every authentication. */
  eligible(binding: KeyBinding): Promise<boolean>;
  /** One hour by default; an integer between fifteen minutes and twelve hours. */
  sessionLifetimeMs?: number;
  now?: () => number;
};
