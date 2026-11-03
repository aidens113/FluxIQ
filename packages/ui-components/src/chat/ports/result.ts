// The answer to one request a client's transport carries, already in words.
// Requests never throw through a port: a transport answers a failure here.

/**
 * `sentence` is what a person reads and `detail` the raw text behind it.
 * `code` says what failed, so the chat branches on it rather than on words:
 * `refused`, `not_paired`, `no_project`, `unreachable`, `timed_out`, `failed`,
 * `invalid_request`, or a Core diagnostic code. `cause` is the host's own words
 * for why a read failed, for a failure only it can name. `unsupported` says this
 * client cannot carry the request at all, so the chat shows its fallback.
 */
export type ChatResult<T> =
  | { ok: true; value: T }
  | { ok: false; sentence: string; detail?: string; cause?: string; unsupported?: true; code?: string };
