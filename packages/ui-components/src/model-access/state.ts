// What a person is told about FluxIQ's AI key: exactly six states, each with fixed words and one action
// (`model-access-words.ts`). `provider` is the provider's display name ("Anthropic"), `keyName` the name the
// person gave the key. No state carries a key's value.

/** The six states of a person's AI key. `null` elsewhere means the state is still being read. */
export type ModelAccessState =
  | { kind: "ready"; provider: string; keyName: string }
  | { kind: "no-key" }
  | { kind: "cant-open"; keyName: string }
  | { kind: "not-accepted"; provider: string; keyName: string }
  | { kind: "unreachable"; provider: string }
  | { kind: "update-fluxiq" };
