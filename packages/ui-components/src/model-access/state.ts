// What a person is told about FluxIQ's AI key: exactly six states, each with fixed words and one action
// (`words.ts`). `provider` is the provider's display name ("Anthropic"), `keyName` the name the person gave
// the key. No state carries a key's value. `message` is Core's own sentence, shown instead of the fixed one
// where Core knows more (a key this person may not use, a key this server cannot open).

/** The six states of a person's AI key. `null` elsewhere means the state is still being read. */
export type ModelAccessState =
  | { kind: "ready"; provider: string; keyName: string; lastAnsweredAtMs?: number }
  | { kind: "no-key"; message?: string; actionLabel?: string }
  | { kind: "cant-open"; keyName: string; message?: string }
  | { kind: "not-accepted"; provider: string; keyName: string }
  | { kind: "unreachable"; provider: string }
  | { kind: "update-fluxiq" };
