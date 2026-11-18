/** Trusted host authorization rechecked inside the write transaction, immediately before mutation. */
export type AppMutationGuard = () => Promise<boolean>;
