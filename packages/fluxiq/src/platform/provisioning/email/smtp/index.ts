// Barrel for the SMTP email sender: a local mail sink or a real relay, with
// STARTTLS or implicit TLS and AUTH PLAIN or LOGIN. The message composer and
// the reply reader are the sender's own parts and stay inside this directory.
export * from "./error.ts";
export * from "./parse-smtp-endpoint.ts";
export * from "./sender.ts";
export type * from "./types.ts";
