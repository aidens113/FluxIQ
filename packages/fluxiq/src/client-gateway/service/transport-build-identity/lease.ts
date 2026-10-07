/** Trusted local lease; release/activate are owner guarded and never wire fields. */
export type TrustedTransportBuildLease = Readonly<{ activate(): void; release(): void }>;
