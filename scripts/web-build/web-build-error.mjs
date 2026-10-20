// An error a keyed web build raises on purpose, with what kind of fault it is:
//
//   environment  the checkout or the cache location cannot hold a build at all
//                (a cache root inside node_modules or too long for Windows, a
//                missing installation); fixing it is a setting, not a retry
//   build        a build ran and its result was refused (no build id, an
//                unstamped identity, a gateway copy that differs, Core changing
//                while it built); nothing was published
//
// Callers that classify failures (a downstream Lab's startup failures) read
// `kind`; `details` names the paths and numbers behind the sentence.

/**
 * @param {"environment" | "build"} kind
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @param {unknown} [cause]
 * @returns {Error & { kind: "environment" | "build", details: Record<string, unknown> }}
 */
export function webBuildError(kind, message, details = {}, cause = undefined) {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { name: "WebBuildError", kind, details });
}
