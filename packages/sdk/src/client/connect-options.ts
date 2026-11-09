// What `FluxIQ.connect` takes. Every field is optional: the credential chain and the
// local engine are the defaults.

export type ConnectOptions = {
  /** The engine's address. Default: `FLUXIQ_ENDPOINT`, then the profile's or project's, then the local engine. */
  url?: string;
  /** The private key itself (PEM text, or `fxkey1.<base64url>`). Prefer `keyFile`, a profile or the environment. */
  apiKey?: string;
  /** A private key file. */
  keyFile?: string;
  /** A profile of `~/.fluxiq/credentials`. */
  profile?: string;
  /** For tests and proxies: the fetch to use. */
  fetch?: typeof fetch;
  /** For tests: the environment and working directory the credential chain reads. */
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};
