// Shared screening policy: whether a key names a secret, so the authored value is withheld
// whatever it looks like.
//
// A credential-shape screen catches a token by its shape; it cannot catch a
// four-digit PIN or a short password, which look like any other text. The key
// they were authored under is what says what they are. A key names a secret
// when one of its words -- split at camel-case humps, digits, `_`, `-`, `.` and
// spaces -- is one of the words below, or two adjacent words or all of them
// run together are (`api_key`, `privateKeyPem`). Words, not substrings:
// `author` is not `auth`, and `shipping` is not `pin`.
//
// The bare word `key` is not on the list (2026-09-30). A keyboard step is
// authored with `key: "Enter"`, and withholding that hid from the repair which
// key the step pressed, which is not a secret. The kinds of key that are secret
// are named in full instead: an API key, a secret key, a private key, an
// access key.

const SECRET_KEY_WORDS: ReadonlySet<string> = new Set([
  "password", "passwords", "passwd", "pwd", "passcode", "passphrase",
  "secret", "secrets",
  "token", "tokens",
  "apikey", "apikeys", "secretkey", "privatekey", "accesskey", "signingkey", "encryptionkey", "sessionkey", "licensekey",
  "credential", "credentials",
  "auth", "authorization",
  "otp", "totp",
  "pin",
  "cvv", "cvc", "csc",
  "card",
  // What carries a signed-in session, most often in a URL's query.
  "session", "sessionid", "sid", "cookie", "cookies", "jwt"
]);

/** Whether `key` names a secret: one of its words is a secret word. */
export function automationStudioSecretNamedKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter(Boolean);
  return words.some((word, index) => SECRET_KEY_WORDS.has(word) || (index > 0 && SECRET_KEY_WORDS.has(words[index - 1] + word)))
    || SECRET_KEY_WORDS.has(words.join(""));
}
