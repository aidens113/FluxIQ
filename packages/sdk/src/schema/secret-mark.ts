// The mark `secret()` leaves on a zod string's definition. A symbol key, so it never collides with
// zod's own fields; zod copies the definition whole when a check is chained (`.min(8)`), so the mark
// stays with the string however it is refined. Internal to this directory.

export const SECRET_MARK: unique symbol = Symbol.for("fluxiq.sdk.secret-input");
